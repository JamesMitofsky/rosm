// Route planning: pick + order a subset of points that fits a distance budget.
// This is an orienteering problem (prize-collecting TSP with a length cap) — NP-hard,
// so we use a greedy nearest-neighbor build under the budget, then 2-opt to tidy order.
// Optional via-points are mandatory anchors the route must pass through (not survey targets).
import { haversine, pathLength, type Pt } from "./geo";
import type { Fountain } from "./schemas";

// Straight-line distance underestimates real street routes; inflate the budget
// check by this factor so the BRouter result tends to land under target.
const DETOUR_FACTOR = 1.3;

// Max straight-line distance a leftover point may add to the route to still be
// auto-grabbed. "Small deviation" — a point this close is nearly free to verify.
const PICKUP_DETOUR_M = 150;

// A node in the ordered route. `fountain` set => survey target; absent => via-point.
export type PlanNode = { lat: number; lon: number; fountain?: Fountain };

export type PlanInput = {
  start: Pt;
  candidates: Fountain[];
  vias?: Pt[]; // mandatory pass-through points (not survey targets)
  pinned?: Fountain[]; // marks the user requires in the route (survey targets)
  // Desired run distance (street meters). 0/undefined => no target: the route is
  // sized purely by the pinned marks (and via-points), no greedy distance-fill.
  targetM?: number;
  loop: boolean;
  autoPickup?: boolean; // grab leftover points a tiny detour off the route (default true)
};

export type PlanResult = {
  ordered: PlanNode[]; // vias + chosen fountains, in visit order
  estM: number; // straight-line estimate (meters)
  autoIds: number[]; // fountain ids auto-added via small-detour pickup
};

function total(start: Pt, nodes: PlanNode[], loop: boolean): number {
  return pathLength([start, ...nodes], loop);
}

// 2-opt: reverse segments while it shortens the (open or closed) path.
function twoOpt(start: Pt, nodes: PlanNode[], loop: boolean): PlanNode[] {
  let best = nodes.slice();
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        if (total(start, cand, loop) + 1e-6 < total(start, best, loop)) {
          best = cand;
          improved = true;
        }
      }
    }
  }
  return best;
}

// Cheapest-insertion of leftover points that sit a tiny detour off the route.
// Each round inserts the single point with the smallest added length, as long as
// that detour stays under `maxCost` and (when targeting) keeps total under budget.
function pickup(
  start: Pt,
  nodes: PlanNode[],
  loop: boolean,
  pool: Fountain[],
  maxCost: number,
  budget: number,
): { nodes: PlanNode[]; addedIds: number[] } {
  const cur = nodes.slice();
  const remaining = pool.slice();
  const addedIds: number[] = [];
  let progress = true;
  while (progress) {
    progress = false;
    const base = total(start, cur, loop);
    let bestCost = Infinity;
    let bestIdx = -1;
    let bestR = -1;
    for (let r = 0; r < remaining.length; r++) {
      const node: PlanNode = {
        lat: remaining[r].lat,
        lon: remaining[r].lon,
        fountain: remaining[r],
      };
      for (let idx = 0; idx <= cur.length; idx++) {
        const cand = cur.slice(0, idx).concat(node, cur.slice(idx));
        const delta = total(start, cand, loop) - base;
        if (delta < bestCost) {
          bestCost = delta;
          bestIdx = idx;
          bestR = r;
        }
      }
    }
    if (bestR >= 0 && bestCost <= maxCost && base + bestCost <= budget) {
      const f = remaining[bestR];
      cur.splice(bestIdx, 0, { lat: f.lat, lon: f.lon, fountain: f });
      addedIds.push(f.id);
      remaining.splice(bestR, 1);
      progress = true;
    }
  }
  return { nodes: cur, addedIds };
}

export function planRoute({
  start,
  candidates,
  vias = [],
  pinned = [],
  targetM = 0,
  loop,
  autoPickup = true,
}: PlanInput): PlanResult {
  const hasTarget = targetM > 0;
  const budget = hasTarget ? targetM / DETOUR_FACTOR : Infinity;
  // Via-points and pinned marks are always included, even if they alone blow the budget.
  const order: PlanNode[] = [
    ...vias.map((v) => ({ lat: v.lat, lon: v.lon })),
    ...pinned.map((f) => ({ lat: f.lat, lon: f.lon, fountain: f })),
  ];
  const pinnedIds = new Set(pinned.map((f) => f.id));
  const remaining = candidates.filter((c) => !pinnedIds.has(c.id));
  let cur: Pt = order.length ? order[order.length - 1] : start;

  // Greedy fill only when a target distance is set; with no target the route is
  // defined purely by the pinned marks (and via-points).
  if (hasTarget) {
    while (remaining.length > 0) {
      remaining.sort((a, b) => haversine(cur, a) - haversine(cur, b));
      let added = false;
      for (let i = 0; i < remaining.length; i++) {
        const node: PlanNode = {
          lat: remaining[i].lat,
          lon: remaining[i].lon,
          fountain: remaining[i],
        };
        if (total(start, [...order, node], loop) <= budget) {
          order.push(node);
          cur = remaining[i];
          remaining.splice(i, 1);
          added = true;
          break;
        }
      }
      if (!added) break; // nothing else fits
    }
  }

  let ordered = twoOpt(start, order, loop);

  // Auto-pickup: grab any leftover point a tiny detour off the planned route.
  // Skip when the route is empty (no anchors) so we don't grab around the start.
  const autoIds: number[] = [];
  if (autoPickup && ordered.length > 0) {
    const grabbed = pickup(start, ordered, loop, remaining, PICKUP_DETOUR_M, budget);
    ordered = twoOpt(start, grabbed.nodes, loop);
    autoIds.push(...grabbed.addedIds);
  }

  return { ordered, estM: total(start, ordered, loop), autoIds };
}
