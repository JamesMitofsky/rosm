// The planner setup is a single guided sequence: pick a start, set the search,
// then build the route. Config walks the first steps; the map is the last one.
// Shared so the progress bar reads identically across both panels.
export const PLANNER_STEP_COUNT = 4; // where → radius → build route → review
export const BUILD_STEP_INDEX = 2;
export const REVIEW_STEP_INDEX = 3;

// Segmented progress bar. Every segment up to and including `current` is filled.
export default function StepProgress({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: PLANNER_STEP_COUNT }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors ${i <= current ? "bg-sky-deep" : "bg-paper-deep"}`}
        />
      ))}
    </div>
  );
}
