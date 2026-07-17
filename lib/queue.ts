import { supabaseAdmin } from "./supabase";

export interface Job {
  id: string;
  url: string;
  chat_id: number | null;
  attempts: number;
}

const LEASE_MS = 90_000;

export async function enqueueJob(url: string, chatId: number | null): Promise<void> {
  await supabaseAdmin().from("jobs").insert({ url, chat_id: chatId });
}

export async function pendingCount(): Promise<number> {
  const { count } = await supabaseAdmin()
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count || 0;
}

/** Acquire the single global worker lease. Returns true if we own it. */
export async function acquireLock(): Promise<boolean> {
  const sb = supabaseAdmin();
  const until = new Date(Date.now() + LEASE_MS).toISOString();
  const now = new Date().toISOString();
  const { data } = await sb
    .from("worker_lock")
    .update({ locked_until: until })
    .eq("id", 1)
    .or(`locked_until.is.null,locked_until.lt.${now}`)
    .select();
  return Boolean(data && data.length);
}

export async function renewLock(): Promise<void> {
  await supabaseAdmin()
    .from("worker_lock")
    .update({ locked_until: new Date(Date.now() + LEASE_MS).toISOString() })
    .eq("id", 1);
}

export async function releaseLock(): Promise<void> {
  await supabaseAdmin().from("worker_lock").update({ locked_until: null }).eq("id", 1);
}

/** Claim the oldest pending job (conditional update guards against races). */
export async function claimNextJob(): Promise<Job | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("jobs")
    .select("id, url, chat_id, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);
  const job = data?.[0] as Job | undefined;
  if (!job) return null;
  const { data: upd } = await sb
    .from("jobs")
    .update({ status: "processing" })
    .eq("id", job.id)
    .eq("status", "pending")
    .select("id");
  return upd && upd.length ? job : null;
}

export async function markJobDone(id: string): Promise<void> {
  await supabaseAdmin().from("jobs").update({ status: "done" }).eq("id", id);
}

export async function markJobError(id: string, msg: string): Promise<void> {
  await supabaseAdmin().from("jobs").update({ status: "error", error: msg.slice(0, 300) }).eq("id", id);
}

/** Housekeeping: drop finished jobs older than a day. */
export async function purgeOldJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  await supabaseAdmin()
    .from("jobs")
    .delete()
    .in("status", ["done", "error"])
    .lt("created_at", cutoff);
}

/** Fire the worker endpoint (returns immediately; it processes in the background). */
export async function triggerWorker(): Promise<void> {
  const base = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
  if (!base) return;
  try {
    await fetch(`${base}/api/worker`, {
      method: "POST",
      headers: { "x-internal-secret": process.env.TELEGRAM_WEBHOOK_SECRET || "" },
    });
  } catch {
    /* fire and forget */
  }
}
