import { fetchWithTimeout } from "./http";

const API = (method: string) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

export async function sendMessage(chatId: number | string, text: string) {
  try {
    await fetchWithTimeout(API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    }, 15_000);
  } catch (e) {
    console.error("telegram sendMessage failed", e);
  }
}

/** Resolve a Telegram file_id to a downloadable path + size. */
export async function getFilePath(
  fileId: string
): Promise<{ path?: string; size?: number }> {
  try {
    const res = await fetchWithTimeout(API("getFile"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    }, 15_000);
    const j = await res.json();
    return { path: j?.result?.file_path, size: j?.result?.file_size };
  } catch (e) {
    console.error("telegram getFile failed", e);
    return {};
  }
}

/** Download a Telegram file by its path (bot API download limit: 20MB). */
export async function downloadFile(path: string): Promise<Buffer> {
  const res = await fetchWithTimeout(
    `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${path}`,
    {},
    30_000
  );
  return Buffer.from(await res.arrayBuffer());
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
