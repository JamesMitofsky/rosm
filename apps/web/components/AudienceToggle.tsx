import type { Audience } from "@/lib/schemas";

const OPTIONS: readonly Audience[] = ["humans", "dogs", "both"];

// Segmented three-way control for who a water source serves. "both" = a human
// fountain that also has a dog bowl. Writes drinking_water=* + dog=* via
// EditExtras.audience on the confirm action.
export default function AudienceToggle({
  value,
  onChange,
  label = "Intended for",
}: {
  value: Audience;
  onChange: (a: Audience) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</span>
      <div className="flex gap-1 rounded-md bg-neutral-100 p-0.5">
        {OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`flex-1 rounded py-1 text-xs font-medium capitalize transition ${
              value === option
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
