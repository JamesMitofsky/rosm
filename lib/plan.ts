// Route planning: pick + order a subset of points that fits a distance budget.
// This is an orienteering problem (prize-collecting TSP with a length cap) — NP-hard,
// so we use a greedy nearest-neighbor build under the budget, then 2-opt to tidy order.
// Optional via-points are mandatory anchors the route must pass through (not survey targets).
import { haversine, pathLength, type Pt } from "./geo";
import type { Fountain } from "./schemas";

// Straight-line distance underestimates real street routes; inflate the budget
// check by this factor so the BRouter result tends to land under target.
const DETOUR_FACTOR = 1.3;

// A node in the ordered route. `fountain` set => survey target; absent => via-point.
export type PlanNode = { lat: number; lon: number; fountain?: Fountain };

export type PlanInput = {
  start: Pt;
  candidates: Fountain[];
  vias?: Pt[]; // mandatory pass-through points
  targetM: number; // desired run distance (street meters)
  loop: boolean;
};

export type PlanResult = {
  ordered: PlanNode[]; // vias + chosen fountains, in visit order
  estM: number; // straight-line estimate (meters)
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

export function planRoute({ start, candidates, vias = [], targetM, loop }: PlanInput): PlanResult {
  const budget = targetM / DETOUR_FACTOR;
  // Via-points are always included, even if they alone blow the budget.
  const order: PlanNode[] = vias.map((v) => ({ lat: v.lat, lon: v.lon }));
  const remaining = candidates.slice();
  let cur: Pt = order.length ? order[order.length - 1] : start;

  while (remaining.length > 0) {
    remaining.sort((a, b) => haversine(cur, a) - haversine(cur, b));
    let added = false;
    for (let i = 0; i < remaining.length; i++) {
      const node: PlanNode = { lat: remaining[i].lat, lon: remaining[i].lon, fountain: remaining[i] };
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

  const ordered = twoOpt(start, order, loop);
  return { ordered, estM: total(start, ordered, loop) };
}
