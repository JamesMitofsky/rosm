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
      className={`border-paper-line flex overflow-hidden rounded-sm border ${textSize === "xs" ? "text-xs" : "text-sm"}`}
    >
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`flex-1 py-1.5 transition ${
            value === o.key
              ? "bg-sky-deep text-ink font-semibold"
              : "bg-paper/40 text-ink-dim hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
