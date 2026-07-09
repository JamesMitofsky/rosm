import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/db";

// Persist the active run plan to JSON (per project convention: file, not localStorage),
// so the mobile run view survives reloads and page hand-off.
export async function POST(req: Request) {
  const plan = await req.json();
  await writeJson("current-run.json", plan);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const plan = await readJson("current-run.json", null);
  return NextResponse.json(plan);
}
