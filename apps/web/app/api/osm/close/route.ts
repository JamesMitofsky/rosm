import { NextResponse } from "next/server";
import { getOsmToken } from "@/lib/osmToken";
import { closeChangeset, changesetUrl } from "@/lib/osm";

// Close the run's changeset when the run ends.
export async function POST(req: Request) {
  const token = await getOsmToken(req);
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
      {
        ok: false,
        error: `${(e as Error).message} (edits already saved; changeset auto-closes later)`,
      },
      { status: 502 },
    );
  }
}
