import { NextResponse } from "next/server";
import { RouteRequest } from "@/lib/schemas";
import { footRoute } from "@/lib/brouter";

export async function POST(req: Request) {
  const parsed = RouteRequest.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { points, loop } = parsed.data;
  try {
    const route = await footRoute(points, loop);
    return NextResponse.json(route);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
