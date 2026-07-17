import { randomUUID } from "crypto";
import { supabaseAdmin } from "./supabase";
import {
  extractRecipe,
  extractRecipeFromVideo,
  extractRecipeFromYouTube,
} from "./gemini";
import type { ExtractedRecipe } from "./types";
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

// Platforms whose recipe may live only in the video — worth transcribing.
const VIDEO_PLATFORMS = new Set(["instagram", "facebook", "tiktok", "youtube"]);
const VIDEO_MAX = 35 * 1024 * 1024;

/** Ask the resolver microservice to turn a page URL into a direct video URL. */
async function resolveVideoUrl(
  pageUrl: string
): Promise<{ video_url?: string; title?: string; uploader?: string } | null> {
  const endpoint = process.env.RESOLVER_URL;
  if (!endpoint) return null;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": process.env.RESOLVER_SECRET || "",
      },
      body: JSON.stringify({ url: pageUrl }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j?.video_url) {
      if (j?.error) console.error("resolver error", j.error);
      return null;
    }
    return j;
  } catch (e) {
    console.error("resolveVideoUrl failed", e);
    return null;
  }
}

/** Download a resolved video, guarding against oversized files. */
async function fetchVideoBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") || 0);
    if (len && len > VIDEO_MAX) {
      console.error("resolved video too large", len);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > VIDEO_MAX ? null : buf;
  } catch (e) {
    console.error("fetchVideoBuffer failed", e);
    return null;
  }
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

export interface SaveResult {
  id: string;
  status: "ok" | "needs_review" | "fetch_failed";
  title: string;
  viaVideo: boolean;
  updated: boolean;
  duplicate: boolean;
}

/**
 * Core save pipeline shared by Telegram, the web share target, and retry.
 * Dedupes by source_url: an already-complete recipe is returned untouched;
 * an incomplete one (needs_review/fetch_failed) is re-processed in place.
 */
export async function saveFromUrl(url: string): Promise<SaveResult> {
  const sb = supabaseAdmin();
  const platform = detectPlatform(url);

  const { data: existing } = await sb
    .from("recipes")
    .select("id, image_url, status, title, ingredients, steps")
    .eq("source_url", url)
    .maybeSingle();

  // Already have a good version — don't clobber it (protects manual edits).
  if (
    existing &&
    existing.status === "ok" &&
    ((existing.ingredients?.length ?? 0) > 0 || (existing.steps?.length ?? 0) > 0)
  ) {
    return {
      id: existing.id,
      status: "ok",
      title: existing.title || "وصفة",
      viaVideo: false,
      updated: false,
      duplicate: true,
    };
  }

  const id = existing?.id || randomUUID();

  const meta = await fetchMeta(url);
  const cleaned = cleanSocialTitle(meta.title);
  if (cleaned.title) meta.title = cleaned.title;
  if (!meta.author && cleaned.author) meta.author = cleaned.author;

  const [captionExtract, freshImage] = await Promise.all([
    extractRecipe({ title: meta.title, caption: meta.caption }),
    persistImage(sb, id, meta.image),
  ]);
  let extracted: ExtractedRecipe | null = captionExtract;
  const image_url = freshImage || existing?.image_url || null;

  const captionHasRecipe =
    extracted?.is_recipe &&
    ((extracted.ingredients?.length ?? 0) > 0 || (extracted.steps?.length ?? 0) > 0);
  let viaVideo = false;
  if (!captionHasRecipe && VIDEO_PLATFORMS.has(platform)) {
    let fromVideo: ExtractedRecipe | null = null;
    if (platform === "youtube") {
      fromVideo = await extractRecipeFromYouTube(url, meta.caption);
    } else {
      const resolved = await resolveVideoUrl(url);
      if (resolved?.video_url) {
        const vbuf = await fetchVideoBuffer(resolved.video_url);
        if (vbuf) fromVideo = await extractRecipeFromVideo(vbuf, "video/mp4", meta.caption);
      }
    }
    if (
      fromVideo?.is_recipe &&
      ((fromVideo.ingredients?.length ?? 0) > 0 || (fromVideo.steps?.length ?? 0) > 0)
    ) {
      extracted = fromVideo;
      viaVideo = true;
    }
  }

  const ingredients = extracted?.ingredients ?? [];
  const steps = extracted?.steps ?? [];
  const title =
    (extracted?.is_recipe && extracted.title) || meta.title || "وصفة بدون عنوان";

  let status: SaveResult["status"] = "ok";
  if (!meta.image && !meta.caption && !meta.title) status = "fetch_failed";
  else if (!extracted?.is_recipe || (ingredients.length === 0 && steps.length === 0))
    status = "needs_review";

  const row = {
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
    raw: { ...meta, via_video: viaVideo },
    lang: "ar",
  };

  const { error } = existing
    ? await sb.from("recipes").update(row).eq("id", id)
    : await sb.from("recipes").insert({ id, ...row });
  if (error) {
    console.error("saveFromUrl db error", error);
    throw new Error(error.message);
  }

  return { id, status, title, viaVideo, updated: Boolean(existing), duplicate: false };
}

/** Telegram entry point: save a shared link and reply in Arabic. */
export async function processShare(url: string, chatId: number): Promise<void> {
  let r: SaveResult;
  try {
    r = await saveFromUrl(url);
  } catch {
    await sendMessage(chatId, "⚠️ حدث خطأ أثناء حفظ الوصفة في قاعدة البيانات.");
    return;
  }

  const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  const link = base ? `\n${base}/recipe/${r.id}` : "";

  if (r.duplicate) {
    await sendMessage(
      chatId,
      `ℹ️ هذه الوصفة محفوظة عندك مسبقًا: <b>${escapeHtml(r.title)}</b>${link}`
    );
  } else if (r.status === "ok") {
    const tag = r.viaVideo ? " 🎬 (من الفيديو)" : "";
    const verb = r.updated ? "تم تحديث" : "تم حفظ";
    await sendMessage(chatId, `✅ ${verb} الوصفة: <b>${escapeHtml(r.title)}</b>${tag}${link}`);
  } else if (r.status === "needs_review") {
    await sendMessage(
      chatId,
      `⚠️ حفظت الرابط والصورة، لكن لم أتمكن من قراءة الوصفة بوضوح. أضفتها لقائمة المراجعة.${link}`
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
