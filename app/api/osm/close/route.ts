import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { closeChangeset, changesetUrl } from "@/lib/osm";

// Close the run's changeset when the run ends.
export async function POST(req: Request) {
  const jar = await cookies();
  const token = jar.get("osm_token")?.value;
  if (!token) return NextResponse.json({ ok: false, error: "not signed in" }, { status: 401 });
  const { changesetId } = (await req.json()) as { changesetId?: number };
  if (!changesetId) return NextResponse.json({ ok: true });
  try {
    await closeChangeset(token, changesetId);
    return NextResponse.json({ ok: true, changesetUrl: changesetUrl(changesetId) });
  } catch (e) {
    // Edits already PUT are live regardless; the changeset also auto-closes
    // server-side after idle. Surface the exact error so the user knows.
    return NextResponse.json(
      { ok: false, error: `${(e as Error).message} (edits already saved; changeset auto-closes later)` },
      { status: 502 },
    );
  }
}
