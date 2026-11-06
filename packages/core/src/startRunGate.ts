// Why the planner can't start a run yet, worded for the person waiting on it,
// or null when it can. The Start Run button is disabled exactly when this
// returns a reason, and the reason shows beside it: a control that can't act
// says why (HIG: Feedback).
export function startRunBlocker(o: {
  // Fountains picked (routed stops or pins).
  hasSelectedFountains: boolean;
  busy: string | null;
  // The stops and line on hand predate the latest change to the picks.
  routeStale: boolean;
  // An error is showing, which carries its own explanation (and Retry).
  hasError: boolean;
}): string | null {
  if (o.busy === "find" || o.busy === "search") return "Finding fountains…";
  if (!o.hasSelectedFountains) return "Add a fountain to your route to start.";
  if (o.busy === "reverse") return "Reversing your route…";
  if (o.busy !== null) return "Updating your route…";
  if (o.routeStale) {
    return o.hasError ? "Fix the route problem above to start." : "Updating your route…";
  }
  return null;
}
