import type { Audience } from "@water-run/core/schemas";
import { SegmentedControl } from "./ui/SegmentedControl";

const OPTIONS: readonly { key: Audience; label: string }[] = [
  { key: "humans", label: "Humans" },
  { key: "both", label: "Both" },
  { key: "dogs", label: "Dogs" },
];

export function AudienceToggle({
  value,
  onChange,
  label = "Intended for",
}: {
  value: Audience;
  onChange: (a: Audience) => void;
  label?: string;
}) {
  return <SegmentedControl label={label} options={OPTIONS} value={value} onChange={onChange} />;
}
