import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { closeChangeset } from "@/lib/osm";

// Close the run's changeset when the run ends.
export async function POST(req: Request) {
  const jar = await cookies();
  const token = jar.get("osm_token")?.value;
  if (!token) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { changesetId } = (await req.json()) as { changesetId?: number };
  if (!changesetId) return NextResponse.json({ ok: true });
  await closeChangeset(token, changesetId);
  return NextResponse.json({ ok: true });
}
