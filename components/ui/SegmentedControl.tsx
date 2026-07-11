"use client";

// A row of mutually exclusive options rendered as one bordered control.
export default function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  textSize = "xs",
}: {
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  textSize?: "xs" | "sm";
}) {
  return (
    <div
      role="group"
      className={`border-paper-line bg-paper-deep/60 flex gap-1 rounded-full border p-1 ${textSize === "xs" ? "text-xs" : "text-sm"}`}
    >
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={`flex-1 rounded-full px-3 py-2 transition ${
              active
                ? "bg-sky-deep font-semibold text-white shadow-sm"
                : "text-ink-dim hover:text-ink font-medium"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
