import type { Dispenser } from "@water-run/core/schemas";
import { SegmentedControl } from "./ui/SegmentedControl";

const OPTIONS: readonly { key: Dispenser; label: string }[] = [
  { key: "bubbler", label: "Bubbler" },
  { key: "both", label: "Both" },
  { key: "bottle", label: "Bottle Filler" },
];

export function DispenserToggle({
  value,
  onChange,
  label = "Dispenser",
}: {
  value: Dispenser;
  onChange: (d: Dispenser) => void;
  label?: string;
}) {
  return <SegmentedControl label={label} options={OPTIONS} value={value} onChange={onChange} />;
}
