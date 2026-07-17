import type { ExtractedRecipe } from "./types";

// `gemini-flash-latest` auto-tracks the newest free-tier Flash model, so we
// don't break when Google retires a version (e.g. 2.0-flash shut down 2026-06).
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const PROMPT = `أنت مساعد متخصص في استخراج وصفات الطبخ من منشورات وسائل التواصل الاجتماعي.
سأعطيك نص المنشور (قد يكون بالعربية أو الإنجليزية أو أي لغة أخرى).
استخرج الوصفة وأعِد النتيجة بصيغة JSON فقط، وكل النصوص يجب أن تكون بالعربية الفصحى (ترجمها إن كانت بلغة أخرى).

الحقول المطلوبة:
{
  "is_recipe": boolean,        // هل النص يحتوي فعلاً على وصفة طبخ واضحة؟
  "title": string,             // اسم الوصفة بالعربية
  "ingredients": string[],     // المكونات، كل مكوّن في سطر مستقل مع الكميات إن وُجدت
  "steps": string[],           // خطوات التحضير مرتبة
  "tags": string[],            // وسوم قصيرة بالعربية مثل: حلويات، سريع، دجاج، نباتي، شوربة
  "servings": string | null,   // عدد الحصص إن ذُكر
  "time_minutes": number | null // وقت التحضير بالدقائق إن أمكن تقديره
}

قواعد مهمة:
- إذا لم يكن النص وصفة طبخ، أعِد is_recipe=false مع title مناسب وباقي القوائم فارغة.
- لا تخترع مكونات أو خطوات غير موجودة؛ استخرج فقط ما هو مذكور أو المفهوم ضمنيًا بوضوح.
- أعِد JSON صالحًا فقط دون أي نص إضافي أو علامات Markdown.

نص المنشور:
`;

export async function extractRecipe(input: {
  title?: string;
  caption?: string;
}): Promise<ExtractedRecipe | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const source = [input.title, input.caption].filter(Boolean).join("\n\n").trim();
  if (!source) return null;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT + source }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      console.error("gemini error", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const text: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(stripFences(text));
    return normalize(parsed);
  } catch (e) {
    console.error("gemini extractRecipe failed", e);
    return null;
  }
}

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
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
    time_minutes:
      typeof p?.time_minutes === "number" ? p.time_minutes : null,
  };
}
