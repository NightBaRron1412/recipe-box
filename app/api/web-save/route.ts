import { NextRequest, NextResponse } from "next/server";
import { extractUrl, saveFromUrl } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const key = process.env.EDIT_KEY;
  return Boolean(key) && req.headers.get("x-edit-key") === key;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const url = extractUrl(String(body?.url || ""));
  if (!url) {
    return NextResponse.json({ error: "no url" }, { status: 400 });
  }
  try {
    const r = await saveFromUrl(url);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("web-save failed", e);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
