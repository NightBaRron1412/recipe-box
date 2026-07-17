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
  "ingredients": string[],     // كل المكونات كقائمة مسطحة (الكميات بالأرقام)
  "ingredient_sections": [     // نفس المكونات مقسّمة حسب أجزاء الوصفة (للعجينة/للصوص...) إن كانت متعددة الأجزاء، وإلا مجموعة واحدة بعنوان ""
    { "title": string, "items": string[] }
  ],
  "steps": string[],           // خطوات التحضير مرتبة
  "tags": string[],            // وسوم قصيرة بالعربية مثل: حلويات، سريع، دجاج، نباتي
  "servings": string | null,   // عدد الحصص إن ذُكر
  "time_minutes": number | null, // وقت التحضير بالدقائق إن أمكن تقديره
  "nutrition": {               // تقدير تقريبي للقيم الغذائية لكامل الوصفة (كل المقادير مجتمعة)، أو null
    "calories": number | null, "protein_g": number | null,
    "carbs_g": number | null, "fat_g": number | null
  } | null
}

قواعد:
- ابدأ كل مكوّن بالكمية كرقم متبوعًا بالوحدة ثم الاسم، مثل: "2 كوب دقيق"، "1 ملعقة كبيرة زبدة"، "½ كوب سكر". لا تكتب الكميات بالكلمات (لا تكتب "كوبين" بل "2 كوب"، ولا "ثلاثة" بل "3").
- إذا لم توجد وصفة أعِد is_recipe=false مع باقي القوائم فارغة. لا تخترع مكونات.
- أعِد JSON صالحًا فقط دون أي نص إضافي أو Markdown.`;

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

// Forcing the response shape stops the model from occasionally returning a bare
// array / wrong shape (which silently became is_recipe=false -> needs_review).
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    is_recipe: { type: "boolean" },
    title: { type: "string" },
    ingredients: { type: "array", items: { type: "string" } },
    ingredient_sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          items: { type: "array", items: { type: "string" } },
        },
        required: ["title", "items"],
      },
    },
    steps: { type: "array", items: { type: "string" } },
    tags: { type: "array", items: { type: "string" } },
    servings: { type: "string", nullable: true },
    time_minutes: { type: "integer", nullable: true },
    nutrition: {
      type: "object",
      nullable: true,
      properties: {
        calories: { type: "integer", nullable: true },
        protein_g: { type: "integer", nullable: true },
        carbs_g: { type: "integer", nullable: true },
        fat_g: { type: "integer", nullable: true },
      },
    },
  },
  required: ["is_recipe", "title", "ingredients", "steps", "tags"],
};

function tagHint(knownTags?: string[]): string {
  if (!knownTags || !knownTags.length) return "";
  return (
    `\n\nمهم بخصوص الوسوم (tags): لديّ قائمة وسوم مستخدمة سابقًا. أعد استخدام الوسم المناسب منها حرفيًا ` +
    `بدل إنشاء وسم جديد مرادف (مثال: استخدم "حلويات" ولا تكتب "حلى" أو "حلوى"). ` +
    `لا تنشئ وسمًا جديدًا إلا إذا لم يوجد أي وسم مناسب في القائمة.\nالقائمة: ${knownTags.join("، ")}`
  );
}

async function callGemini(parts: unknown[], attempt = 0): Promise<ExtractedRecipe | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${BASE}/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
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
export async function extractRecipe(
  input: { title?: string; caption?: string },
  knownTags?: string[]
): Promise<ExtractedRecipe | null> {
  const source = [input.title, input.caption].filter(Boolean).join("\n\n").trim();
  if (!source) return null;
  return callGemini([{ text: TEXT_PROMPT + source + tagHint(knownTags) }]);
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
  knownTags?: string[]
): Promise<ExtractedRecipe | null> {
  const base = mimeType.startsWith("audio/") ? AUDIO_PROMPT : VIDEO_PROMPT;
  const promptText = base + tagHint(knownTags);
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
  knownTags?: string[],
  extra?: string
): Promise<ExtractedRecipe | null> {
  const promptText = IMAGE_PROMPT + (extra ? `\n\nنص مرفق:\n${extra}` : "") + tagHint(knownTags);
  return callGemini([
    { text: promptText },
    { inlineData: { mimeType, data: buf.toString("base64") } },
  ]);
}

/** Extract a recipe from a YouTube URL — Gemini ingests YouTube natively. */
export async function extractRecipeFromYouTube(
  url: string,
  knownTags?: string[]
): Promise<ExtractedRecipe | null> {
  return callGemini([
    { text: VIDEO_PROMPT + tagHint(knownTags) },
    { fileData: { fileUri: url } },
  ]);
}

/** Estimate approximate per-serving nutrition from a recipe's ingredients. */
export async function estimateNutrition(
  title: string,
  ingredients: string[],
  servings?: string | null
): Promise<{ calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null } | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !ingredients.length) return null;
  void servings;
  const prompt =
    `قدّر القيم الغذائية التقريبية لكامل وصفة "${title}" (جميع المقادير مجتمعة، وليس للحصة الواحدة).\nالمكونات:\n${ingredients.join("\n")}\n` +
    `أعِد JSON فقط بالأرقام الصحيحة (calories, protein_g, carbs_g, fat_g) أو null لكل قيمة غير معروفة.`;
  const schema = {
    type: "object",
    properties: {
      calories: { type: "integer", nullable: true },
      protein_g: { type: "integer", nullable: true },
      carbs_g: { type: "integer", nullable: true },
      fat_g: { type: "integer", nullable: true },
    },
  };
  try {
    const res = await fetch(`${BASE}/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    return normNutrition(JSON.parse(stripFences(text)));
  } catch {
    return null;
  }
}

/** Ask the model to merge synonymous Arabic tags into a canonical set.
 * Returns a map of {oldTag: canonicalTag}. */
export async function consolidateTags(tags: string[]): Promise<Record<string, string>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !tags.length) return {};
  const prompt =
    `هذه قائمة وسوم عربية لوصفات طبخ. وحّدها في مجموعة نظيفة: ادمج المترادفات والأشكال المختلفة ` +
    `في وسم واحد موحّد (أمثلة: حلى/حلوى/حلويات → حلويات، فراخ/دجاج → دجاج، مقبلات/مقبّلات → مقبلات). ` +
    `أبقِ الوسوم الجيدة كما هي. لكل وسم في القائمة أعِد الشكل الموحّد المناسب له.\nالقائمة: ${tags.join("، ")}`;
  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: { from: { type: "string" }, to: { type: "string" } },
      required: ["from", "to"],
    },
  };
  try {
    const res = await fetch(`${BASE}/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema },
      }),
    });
    if (!res.ok) {
      console.error("consolidateTags error", res.status, await res.text());
      return {};
    }
    const data = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return {};
    const arr = JSON.parse(stripFences(text));
    const map: Record<string, string> = {};
    if (Array.isArray(arr)) {
      for (const p of arr) {
        const from = String(p?.from || "").trim();
        const to = String(p?.to || "").trim();
        if (from && to) map[from] = to;
      }
    }
    return map;
  } catch (e) {
    console.error("consolidateTags failed", e);
    return {};
  }
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function normalize(p: any): ExtractedRecipe {
  if (Array.isArray(p)) p = p[0] || {}; // guard against array-wrapped output
  const arr = (v: any): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
  return {
    is_recipe: Boolean(p?.is_recipe),
    title: (p?.title ? String(p.title) : "").trim(),
    ingredients: arr(p?.ingredients),
    ingredient_sections: Array.isArray(p?.ingredient_sections)
      ? p.ingredient_sections
          .map((s: any) => ({ title: String(s?.title || "").trim(), items: arr(s?.items) }))
          .filter((s: any) => s.items.length)
      : [],
    steps: arr(p?.steps),
    tags: arr(p?.tags),
    servings: p?.servings ? String(p.servings) : null,
    time_minutes: typeof p?.time_minutes === "number" ? p.time_minutes : null,
    nutrition: normNutrition(p?.nutrition),
  };
}

function normNutrition(n: any) {
  if (!n || typeof n !== "object") return null;
  const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
  const out = {
    calories: num(n.calories),
    protein_g: num(n.protein_g),
    carbs_g: num(n.carbs_g),
    fat_g: num(n.fat_g),
  };
  return out.calories == null && out.protein_g == null && out.carbs_g == null && out.fat_g == null
    ? null
    : out;
}
