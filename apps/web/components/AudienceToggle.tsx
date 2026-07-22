import type { ComponentType } from "react";
import { User } from "@phosphor-icons/react";
import type { Audience } from "@rosm/core/schemas";
import { DogIcon } from "@/components/icons/DogIcon";
import { BothAudienceIcon } from "@/components/icons/BothAudienceIcon";

const OPTIONS: readonly {
  key: Audience;
  label: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
}[] = [
  { key: "humans", label: "Humans", Icon: User },
  { key: "both", label: "Both", Icon: BothAudienceIcon },
  { key: "dogs", label: "Dogs", Icon: DogIcon },
];

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
        {OPTIONS.map(({ key, label: optLabel, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`flex flex-1 items-center justify-center gap-1 rounded py-1 text-xs font-medium capitalize transition ${
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
