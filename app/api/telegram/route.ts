import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { extractUrl, processShare } from "@/lib/pipeline";
import { sendMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // 1) Verify the secret header Telegram echoes back from setWebhook.
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const msg = update?.message ?? update?.channel_post;
  const chatId: number | undefined = msg?.chat?.id;
  const fromId = msg?.from?.id;
  const text: string = (msg?.text ?? msg?.caption ?? "").trim();

  if (!chatId) return NextResponse.json({ ok: true });

  // 2) Restrict to the owner (once ALLOWED_TELEGRAM_USER_ID is set).
  const allowed = process.env.ALLOWED_TELEGRAM_USER_ID;
  if (allowed && String(fromId) !== String(allowed)) {
    await sendMessage(chatId, "عذرًا، هذا البوت خاص. 🔒");
    return NextResponse.json({ ok: true });
  }

  // 3) Commands / help.
  if (text.startsWith("/start") || text.startsWith("/help")) {
    await sendMessage(
      chatId,
      `أهلاً بك في <b>كتاب الوصفات</b> 🍽️\n\n` +
        `أرسل لي رابط وصفة من انستغرام أو فيسبوك أو تيك توك وسأحفظها لك تلقائيًا مع الصورة والمكونات والخطوات.\n\n` +
        `معرفك في تيليجرام: <code>${fromId}</code>`
    );
    return NextResponse.json({ ok: true });
  }

  const url = extractUrl(text);
  if (!url) {
    await sendMessage(
      chatId,
      "من فضلك أرسل رابط وصفة (انستغرام / فيسبوك / تيك توك). 🔗"
    );
    return NextResponse.json({ ok: true });
  }

  // 4) Acknowledge fast, then process in the background so Telegram gets a
  //    quick 200 and we don't hit the webhook timeout.
  await sendMessage(chatId, "⏳ جاري حفظ الوصفة...");
  waitUntil(
    processShare(url, chatId).catch(async (e) => {
      console.error("processShare failed", e);
      await sendMessage(chatId, "⚠️ حدث خطأ غير متوقع أثناء الحفظ.");
    })
  );

  return NextResponse.json({ ok: true });
}
