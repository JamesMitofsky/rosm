import type { Dispenser } from "@rosm/core/schemas";
import { BubblerIcon, BothDispenserIcon, BottleIcon } from "@/components/icons/DispenserIcons";

const OPTIONS: readonly {
  key: Dispenser;
  label: string;
  Icon: typeof BubblerIcon;
}[] = [
  { key: "bubbler", label: "Bubbler", Icon: BubblerIcon },
  { key: "both", label: "Both", Icon: BothDispenserIcon },
  { key: "bottle", label: "Bottle filler", Icon: BottleIcon },
];

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
        {OPTIONS.map(({ key, label: optLabel, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`flex flex-1 items-center justify-center gap-1 rounded py-1 text-xs font-medium transition ${
              value === key
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <Icon size={14} />
            <span>{optLabel}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
