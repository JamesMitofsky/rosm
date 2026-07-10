import { NextResponse } from "next/server";
import { FountainsRequest } from "@rosm/core/schemas";
import { fetchFountains, OverpassError } from "@/lib/overpass";
import { writeJson } from "@/lib/db";

export async function POST(req: Request) {
  const parsed = FountainsRequest.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { lat, lon, radiusM, bounds, tag, recencyMode, recencyMonths, includeDisused } =
    parsed.data;
  // The schema guarantees exactly one mode; assert non-null for the chosen one.
  const region = bounds
    ? { bounds }
    : { lat: lat as number, lon: lon as number, radiusM: radiusM as number };
  try {
    const fountains = await fetchFountains(region, tag, recencyMode, recencyMonths, includeDisused);
    // Cache write is best-effort; a failure must not break the response.
    await writeJson("fountains-cache.json", {
      at: new Date().toISOString(),
      ...region,
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
