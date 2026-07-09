import { NextResponse } from "next/server";
import { RouteRequest } from "@rosm/core/schemas";
import { footRoute, RouteError } from "@rosm/core/brouter";

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
    const err = e as RouteError;
    // `island` (when present) is the unreachable point's coords, so the client
    // can highlight exactly where the route breaks.
    return NextResponse.json({ error: err.message, island: err.island }, { status: 502 });
  }
}
