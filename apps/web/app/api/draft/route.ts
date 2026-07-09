import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/db";

// Persist an in-progress planner draft (a built-but-not-started route) to JSON
// (per project convention: file, not localStorage), so a refresh on /plan can
// offer to resume the route instead of losing all the setup work.
export async function POST(req: Request) {
  const draft = await req.json();
  await writeJson("current-draft.json", draft);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const draft = await readJson("current-draft.json", null);
  return NextResponse.json(draft);
}

// Clear the draft once the route is started, or the user dismisses the resume offer.
export async function DELETE() {
  await writeJson("current-draft.json", null);
  return NextResponse.json({ ok: true });
}
