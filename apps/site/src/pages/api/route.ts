import type { APIRoute } from "astro";
import { z } from "zod";
import { RouteRequest } from "@rosm/core/schemas";
import { footRoute, RouteError } from "@rosm/core/brouter";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const parsed = RouteRequest.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: z.flattenError(parsed.error) }, { status: 400 });
  }
  const { points, loop } = parsed.data;
  try {
    const route = await footRoute(points, loop);
    return Response.json(route);
  } catch (e) {
    const err = e as RouteError;
    // `island` (when present) is the unreachable point's coords, so the client
    // can highlight exactly where the route breaks.
    return Response.json({ error: err.message, island: err.island }, { status: 502 });
  }
};
