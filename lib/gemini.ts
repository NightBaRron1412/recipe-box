import type { ExtractedRecipe } from "./types";

const BASE = "https://generativelanguage.googleapis.com";
// flash-lite has by far the highest free-tier daily quota (flash-latest points
// to 3.5-flash which is capped at ~20 requests/day). flash-lite handles
// text/image/audio/video, which is all we need.
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

const SCHEMA_HINT = `الحقول المطلوبة:
{
  "is_recipe": boolean,        // هل يوجد فعلاً وصفة طبخ واضحة؟
  "title": string,             // اسم الوصفة بالعربية
  "ingredients": string[],     // المكونات، كل مكوّن في سطر مع الكميات إن وُجدت
  "steps": string[],           // خطوات التحضير مرتبة
  "tags": string[],            // وسوم قصيرة بالعربية مثل: حلويات، سريع، دجاج، نباتي
  "servings": string | null,   // عدد الحصص إن ذُكر
  "time_minutes": number | null // وقت التحضير بالدقائق إن أمكن تقديره
}

قواعد: إذا لم توجد وصفة أعِد is_recipe=false مع باقي القوائم فارغة. لا تخترع مكونات.
أعِد JSON صالحًا فقط دون أي نص إضافي أو Markdown.`;

const TEXT_PROMPT = `أنت مساعد متخصص في استخراج وصفات الطبخ من منشورات وسائل التواصل الاجتماعي.
سأعطيك نص المنشور (قد يكون بأي لغة). استخرج الوصفة وأعِد النتيجة بصيغة JSON فقط،
وكل النصوص يجب أن تكون بالعربية الفصحى (ترجمها إن لزم).

${SCHEMA_HINT}

نص المنشور:
`;

const VIDEO_PROMPT = `هذا فيديو لوصفة طبخ. استمع جيدًا إلى الشرح المنطوق واقرأ أي نص يظهر على الشاشة،
ثم استخرج الوصفة كاملة وأعِد النتيجة بصيغة JSON فقط، وكل النصوص بالعربية الفصحى (ترجم إن لزم).

${SCHEMA_HINT}`;

const AUDIO_PROMPT = `هذا مقطع صوتي لوصفة طبخ (صوت من فيديو). استمع جيدًا إلى الشرح المنطوق
واستخرج الوصفة كاملة، وأعِد النتيجة بصيغة JSON فقط، وكل النصوص بالعربية الفصحى (ترجم إن لزم).

${SCHEMA_HINT}`;

async function callGemini(parts: unknown[], attempt = 0): Promise<ExtractedRecipe | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${BASE}/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    });
    // Per-minute rate limit — wait once and retry (within the function budget).
    if (res.status === 429 && attempt < 1) {
      await new Promise((r) => setTimeout(r, 9000));
      return callGemini(parts, attempt + 1);
    }
    if (!res.ok) {
      console.error("gemini generate error", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const text: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    return normalize(JSON.parse(stripFences(text)));
  } catch (e) {
    console.error("gemini call failed", e);
    return null;
  }
}

/** Extract a recipe from post text (title + caption). */
export async function extractRecipe(input: {
  title?: string;
  caption?: string;
}): Promise<ExtractedRecipe | null> {
  const source = [input.title, input.caption].filter(Boolean).join("\n\n").trim();
  if (!source) return null;
  return callGemini([{ text: TEXT_PROMPT + source }]);
}

// Inline request must stay under Gemini's ~20MB total limit; base64 inflates by
// ~33%, so cap inline at 14MB raw and use the Files API above that.
const INLINE_MAX = 14 * 1024 * 1024;

/** Upload a video via the resumable Files API and wait until it's ACTIVE. */
async function geminiUploadFile(buf: Buffer, mimeType: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const start = await fetch(`${BASE}/upload/v1beta/files`, {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(buf.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: "reel" } }),
    });
    const uploadUrl = start.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
      console.error("gemini files: no upload url", start.status, await start.text());
      return null;
    }
    const up = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: new Uint8Array(buf),
    });
    if (!up.ok) {
      console.error("gemini files: upload failed", up.status, await up.text());
      return null;
    }
    let file = (await up.json())?.file;
    if (!file?.name) return null;
    // Video files start as PROCESSING; poll until ACTIVE.
    for (let i = 0; i < 20 && file.state !== "ACTIVE"; i++) {
      if (file.state === "FAILED") {
        console.error("gemini files: processing FAILED");
        return null;
      }
      await new Promise((r) => setTimeout(r, 2000));
      const g = await fetch(`${BASE}/v1beta/${file.name}`, {
        headers: { "x-goog-api-key": key },
      });
      file = await g.json();
    }
    return file.state === "ACTIVE" ? file.uri : null;
  } catch (e) {
    console.error("geminiUploadFile failed", e);
    return null;
  }
}

/** Extract a recipe from a video (transcribes speech + on-screen text). */
export async function extractRecipeFromVideo(
  buf: Buffer,
  mimeType: string,
  extra?: string
): Promise<ExtractedRecipe | null> {
  const base = mimeType.startsWith("audio/") ? AUDIO_PROMPT : VIDEO_PROMPT;
  const promptText = base + (extra ? `\n\nنص مرفق:\n${extra}` : "");
  if (buf.length <= INLINE_MAX) {
    return callGemini([
      { text: promptText },
      { inlineData: { mimeType, data: buf.toString("base64") } },
    ]);
  }
  const uri = await geminiUploadFile(buf, mimeType);
  if (!uri) return null;
  return callGemini([{ text: promptText }, { fileData: { mimeType, fileUri: uri } }]);
}

const IMAGE_PROMPT = `هذه صورة تحتوي على وصفة طبخ (لقطة شاشة، أو صفحة كتاب، أو وصفة مكتوبة بخط اليد).
اقرأ كل النص في الصورة بعناية واستخرج الوصفة كاملة، وأعِد النتيجة بصيغة JSON فقط،
وكل النصوص بالعربية الفصحى (ترجم إن لزم).

${SCHEMA_HINT}`;

/** Extract a recipe from an image (screenshot / handwritten / cookbook page). */
export async function extractRecipeFromImage(
  buf: Buffer,
  mimeType: string,
  extra?: string
): Promise<ExtractedRecipe | null> {
  const promptText = IMAGE_PROMPT + (extra ? `\n\nنص مرفق:\n${extra}` : "");
  return callGemini([
    { text: promptText },
    { inlineData: { mimeType, data: buf.toString("base64") } },
  ]);
}

/** Extract a recipe from a YouTube URL — Gemini ingests YouTube natively. */
export async function extractRecipeFromYouTube(
  url: string,
  extra?: string
): Promise<ExtractedRecipe | null> {
  const promptText = VIDEO_PROMPT + (extra ? `\n\nنص مرفق:\n${extra}` : "");
  return callGemini([{ text: promptText }, { fileData: { fileUri: url } }]);
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function normalize(p: any): ExtractedRecipe {
  const arr = (v: any): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
  return {
    is_recipe: Boolean(p?.is_recipe),
    title: (p?.title ? String(p.title) : "").trim(),
    ingredients: arr(p?.ingredients),
    steps: arr(p?.steps),
    tags: arr(p?.tags),
    servings: p?.servings ? String(p.servings) : null,
    time_minutes: typeof p?.time_minutes === "number" ? p.time_minutes : null,
  };
}
