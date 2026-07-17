import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { saveFromUrl, sendSaveResult } from "@/lib/pipeline";
import { sendMessage } from "@/lib/telegram";
import {
  acquireLock,
  renewLock,
  releaseLock,
  claimNextJob,
  markJobDone,
  markJobError,
  pendingCount,
  triggerWorker,
} from "@/lib/queue";

export const runtime = "nodejs";
export const maxDuration = 60;

// Spacing between jobs keeps us comfortably under Gemini's per-minute limit.
const GAP_MS = 3500;
const BUDGET_MS = 45_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  if (req.headers.get("x-internal-secret") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Only one worker runs at a time (serialises all Gemini calls).
  if (!(await acquireLock())) {
    return NextResponse.json({ ok: true, skipped: "locked" });
  }

  waitUntil(
    (async () => {
      const deadline = Date.now() + BUDGET_MS;
      try {
        while (Date.now() < deadline) {
          await renewLock();
          const job = await claimNextJob();
          if (!job) break;
          try {
            const r = await saveFromUrl(job.url);
            if (job.chat_id) await sendSaveResult(job.chat_id, r);
            await markJobDone(job.id);
          } catch (e) {
            await markJobError(job.id, String(e));
            if (job.chat_id) await sendMessage(job.chat_id, "⚠️ تعذّر حفظ أحد الروابط.");
          }
          await sleep(GAP_MS);
        }
      } finally {
        await releaseLock();
        // Hand off any leftover work to a fresh worker invocation.
        if ((await pendingCount()) > 0) await triggerWorker();
      }
    })()
  );

  return NextResponse.json({ ok: true });
}
