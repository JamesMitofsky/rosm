import type { Dispenser } from "@/lib/schemas";

const OPTIONS: readonly { key: Dispenser; label: string }[] = [
  { key: "bubbler", label: "Bubbler" },
  { key: "bottle", label: "Bottle filler" },
  { key: "both", label: "Both" },
];

// Segmented three-way control for how a water source is dispensed. "bubbler" = a
// jet you drink from directly, "bottle" = a bottle-refill spout, "both" = a
// fountain that does both. Writes fountain=bubbler + bottle=* via
// EditExtras.dispenser on the confirm action.
export default function DispenserToggle({
  value,
  onChange,
  label = "Dispenser",
}: {
  value: Dispenser;
  onChange: (d: Dispenser) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</span>
      <div className="flex gap-1 rounded-md bg-neutral-100 p-0.5">
        {OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={`flex-1 rounded py-1 text-xs font-medium transition ${
              value === option.key
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
