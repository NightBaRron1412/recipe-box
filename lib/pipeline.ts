import { randomUUID } from "crypto";
import { supabaseAdmin } from "./supabase";
import { extractRecipe, extractRecipeFromVideo } from "./gemini";
import {
  sendMessage,
  escapeHtml,
  getFilePath,
  downloadFile,
} from "./telegram";
import type { PageMeta } from "./types";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Facebook & Instagram return HTTP 400 to a normal browser UA but serve full
// OpenGraph tags (title/description/image) to their own crawler UA. This is the
// key that unlocks reel/post previews server-side.
const CRAWLER_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

/** Pull the first http(s) URL out of a message. */
export function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s]+/);
  return m ? m[0].replace(/[)\].,]+$/, "") : null;
}

export function detectPlatform(url: string): string {
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/facebook\.com|fb\.watch|fb\.com|m\.facebook/i.test(url)) return "facebook";
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  return "other";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

/** Parse all <meta> tags regardless of attribute order. */
function parseMetaTags(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    const val = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
    if (key && val != null) out[key.toLowerCase()] = decodeEntities(val);
  }
  return out;
}

function metaFromHtml(html: string): PageMeta {
  const meta = parseMetaTags(html);
  return {
    image: meta["og:image"] || meta["twitter:image"],
    caption:
      meta["og:description"] || meta["description"] || meta["twitter:description"],
    title: meta["og:title"] || meta["twitter:title"],
    author: meta["og:site_name"] || meta["author"],
  };
}

function hasContent(m: PageMeta): boolean {
  return Boolean(m.image || m.title || m.caption);
}

async function fetchWith(url: string, ua: string): Promise<PageMeta> {
  const res = await fetch(url, {
    headers: { "User-Agent": ua, "Accept-Language": "ar,en;q=0.9" },
    redirect: "follow",
  });
  if (!res.ok) return {};
  return metaFromHtml(await res.text());
}

/**
 * Best-effort OpenGraph fetch. Tries the FB/IG crawler UA first (required for
 * their reels), then falls back to a browser UA for sites that prefer it.
 * Never throws.
 */
export async function fetchMeta(url: string): Promise<PageMeta> {
  try {
    const primary = await fetchWith(url, CRAWLER_UA);
    if (hasContent(primary)) return primary;
    const fallback = await fetchWith(url, BROWSER_UA);
    return hasContent(fallback) ? fallback : primary;
  } catch (e) {
    console.error("fetchMeta failed", e);
    return {};
  }
}

/**
 * FB/IG set og:title to "<views> · <reactions> | <caption line> | <author>".
 * Strip the stats segment and pull the author out so titles read cleanly.
 */
export function cleanSocialTitle(raw?: string): { title?: string; author?: string } {
  if (!raw) return {};
  const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);
  const isStats = (s: string) =>
    /(مشاهدة|تفاعل|إعجاب|تعليق|مشاركة|views?|reactions?|likes?|comments?|shares?)/i.test(s) &&
    /(\d|ألف|k|m|مليون|thousand|million)/i.test(s);
  const kept = parts.filter((p) => !isStats(p));
  let author: string | undefined;
  if (kept.length > 1) author = kept.pop();
  const title = kept.join(" — ").trim() || undefined;
  return { title, author };
}

/** Upload raw image bytes to Supabase Storage. Returns public URL or null. */
async function uploadImageBuffer(
  sb: ReturnType<typeof supabaseAdmin>,
  id: string,
  buf: Buffer,
  ct: string
): Promise<string | null> {
  try {
    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
    const path = `${id}.${ext}`;
    const { error } = await sb.storage
      .from("recipe-images")
      .upload(path, buf, { contentType: ct, upsert: true });
    if (error) {
      console.error("storage upload failed", error);
      return null;
    }
    return sb.storage.from("recipe-images").getPublicUrl(path).data.publicUrl;
  } catch (e) {
    console.error("uploadImageBuffer failed", e);
    return null;
  }
}

/** Download the cover image from a URL and store it. Returns public URL or null. */
async function persistImage(
  sb: ReturnType<typeof supabaseAdmin>,
  id: string,
  imageUrl?: string
): Promise<string | null> {
  if (!imageUrl) return null;
  try {
    const res = await fetch(imageUrl, { headers: { "User-Agent": BROWSER_UA } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return uploadImageBuffer(sb, id, buf, res.headers.get("content-type") || "image/jpeg");
  } catch (e) {
    console.error("persistImage failed", e);
    return null;
  }
}

/**
 * Full pipeline for one shared URL: fetch meta -> extract recipe -> persist
 * image -> insert row -> reply to the user in Arabic.
 */
export async function processShare(url: string, chatId: number): Promise<void> {
  const sb = supabaseAdmin();
  const id = randomUUID();
  const platform = detectPlatform(url);

  const meta = await fetchMeta(url);

  // Clean FB/IG title ("views · reactions | caption | author") and lift author.
  const cleaned = cleanSocialTitle(meta.title);
  if (cleaned.title) meta.title = cleaned.title;
  if (!meta.author && cleaned.author) meta.author = cleaned.author;

  const [extracted, image_url] = await Promise.all([
    extractRecipe({ title: meta.title, caption: meta.caption }),
    persistImage(sb, id, meta.image),
  ]);

  const ingredients = extracted?.ingredients ?? [];
  const steps = extracted?.steps ?? [];
  const title =
    (extracted?.is_recipe && extracted.title) || meta.title || "وصفة بدون عنوان";

  let status: "ok" | "needs_review" | "fetch_failed" = "ok";
  if (!meta.image && !meta.caption && !meta.title) {
    status = "fetch_failed";
  } else if (!extracted?.is_recipe || (ingredients.length === 0 && steps.length === 0)) {
    status = "needs_review";
  }

  const { error } = await sb.from("recipes").insert({
    id,
    source_url: url,
    platform,
    author: meta.author ?? null,
    title,
    caption: meta.caption ?? null,
    image_url,
    ingredients,
    steps,
    tags: extracted?.tags ?? [],
    servings: extracted?.servings ?? null,
    time_minutes: extracted?.time_minutes ?? null,
    status,
    raw: meta,
    lang: "ar",
  });

  if (error) {
    console.error("insert failed", error);
    await sendMessage(chatId, "⚠️ حدث خطأ أثناء حفظ الوصفة في قاعدة البيانات.");
    return;
  }

  const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  const link = base ? `\n${base}/recipe/${id}` : "";

  if (status === "ok") {
    await sendMessage(chatId, `✅ تم حفظ الوصفة: <b>${escapeHtml(title)}</b>${link}`);
  } else if (status === "needs_review") {
    await sendMessage(
      chatId,
      `⚠️ حفظت الرابط والصورة، لكن لم أتمكن من قراءة الوصفة بوضوح (قد تكون في الفيديو). أضفتها لقائمة المراجعة.${link}`
    );
  } else {
    await sendMessage(
      chatId,
      `⚠️ لم أستطع جلب محتوى الرابط (قد يكون خاصًا). حفظت الرابط فقط.${link}`
    );
  }
}

const TG_DOWNLOAD_MAX = 20 * 1024 * 1024; // Telegram bot API download limit

/**
 * Pipeline for a video sent directly to the bot: download from Telegram ->
 * Gemini transcribes speech + on-screen text -> extract recipe -> insert ->
 * reply. Used for reels whose recipe is only spoken (not in the caption).
 */
export async function processVideo(opts: {
  fileId: string;
  thumbFileId?: string;
  mimeType?: string;
  chatId: number;
  caption?: string;
  sizeHint?: number;
}): Promise<void> {
  const sb = supabaseAdmin();
  const id = randomUUID();

  const { path, size } = await getFilePath(opts.fileId);
  if (!path) {
    await sendMessage(opts.chatId, "⚠️ تعذّر الوصول إلى الفيديو من تيليجرام.");
    return;
  }
  if ((size || opts.sizeHint || 0) > TG_DOWNLOAD_MAX) {
    await sendMessage(
      opts.chatId,
      "⚠️ حجم الفيديو أكبر من 20 ميجابايت (حد بوت تيليجرام للتنزيل). أرسل مقطعًا أقصر أو بجودة أقل."
    );
    return;
  }

  const buf = await downloadFile(path);
  const mimeType = opts.mimeType || "video/mp4";

  const [extracted, image_url] = await Promise.all([
    extractRecipeFromVideo(buf, mimeType, opts.caption),
    (async () => {
      if (!opts.thumbFileId) return null;
      const t = await getFilePath(opts.thumbFileId);
      if (!t.path) return null;
      return uploadImageBuffer(sb, id, await downloadFile(t.path), "image/jpeg");
    })(),
  ]);

  const ingredients = extracted?.ingredients ?? [];
  const steps = extracted?.steps ?? [];
  const title = (extracted?.is_recipe && extracted.title) || "وصفة من فيديو";
  const captionUrl = opts.caption ? extractUrl(opts.caption) : null;

  const status: "ok" | "needs_review" =
    !extracted?.is_recipe || (ingredients.length === 0 && steps.length === 0)
      ? "needs_review"
      : "ok";

  const { error } = await sb.from("recipes").insert({
    id,
    source_url: captionUrl || "video-upload",
    platform: captionUrl ? detectPlatform(captionUrl) : "video",
    author: null,
    title,
    caption: opts.caption ?? null,
    image_url,
    ingredients,
    steps,
    tags: extracted?.tags ?? [],
    servings: extracted?.servings ?? null,
    time_minutes: extracted?.time_minutes ?? null,
    status,
    raw: { via: "telegram_video" },
    lang: "ar",
  });

  if (error) {
    console.error("insert failed", error);
    await sendMessage(opts.chatId, "⚠️ حدث خطأ أثناء الحفظ في قاعدة البيانات.");
    return;
  }

  const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  const link = base ? `\n${base}/recipe/${id}` : "";
  if (status === "ok") {
    await sendMessage(
      opts.chatId,
      `✅ تم استخراج الوصفة من الفيديو: <b>${escapeHtml(title)}</b>${link}`
    );
  } else {
    await sendMessage(
      opts.chatId,
      `⚠️ حفظت الفيديو لكن لم أتمكن من استخراج وصفة واضحة منه.${link}`
    );
  }
}
