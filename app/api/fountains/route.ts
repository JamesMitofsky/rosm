import { NextResponse } from "next/server";
import { FountainsRequest } from "@/lib/schemas";
import { fetchFountains } from "@/lib/overpass";
import { writeJson } from "@/lib/db";

export async function POST(req: Request) {
  const parsed = FountainsRequest.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { lat, lon, radiusM, tag } = parsed.data;
  try {
    const fountains = await fetchFountains(lat, lon, radiusM, tag);
    await writeJson("fountains-cache.json", { at: new Date().toISOString(), lat, lon, radiusM, tag, fountains });
    return NextResponse.json({ fountains });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
