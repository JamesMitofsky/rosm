import { NextResponse } from "next/server";
import { FountainsRequest } from "@/lib/schemas";
import { fetchFountains, OverpassError } from "@/lib/overpass";
import { writeJson } from "@/lib/db";

export async function POST(req: Request) {
  const parsed = FountainsRequest.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { lat, lon, radiusM, tag, recencyMode, recencyMonths, includeDisused } = parsed.data;
  try {
    const fountains = await fetchFountains(
      lat,
      lon,
      radiusM,
      tag,
      recencyMode,
      recencyMonths,
      includeDisused,
    );
    // Cache write is best-effort; a failure must not break the response.
    await writeJson("fountains-cache.json", {
      at: new Date().toISOString(),
      lat,
      lon,
      radiusM,
      tag,
      recencyMode,
      recencyMonths,
      fountains,
    }).catch(() => {});
    return NextResponse.json({ fountains });
  } catch (e) {
    const retryable = e instanceof OverpassError ? e.retryable : false;
    return NextResponse.json(
      { error: { message: (e as Error).message, retryable } },
      // 503 (Service Unavailable) for transient overload/timeout, 502 otherwise.
      { status: retryable ? 503 : 502 },
    );
  }
}
