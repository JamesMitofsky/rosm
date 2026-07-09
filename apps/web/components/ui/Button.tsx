"use client";

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "accent";
type Size = "sm" | "md";

// The three recurring button shapes in the app. Layout concerns (flex-1,
// icon gaps, width) stay at the call site via className.
const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-soft disabled:hover:bg-ink font-bold",
  outline: "border-paper-line text-ink-dim hover:text-ink border font-semibold",
  accent:
    "border-sky-deep/40 text-sky-deep hover:bg-sky/10 border font-semibold disabled:hover:bg-transparent",
};

const SIZE: Record<Size, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-5 py-2.5 text-sm",
};

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type}
      className={`rounded-sm transition disabled:opacity-40 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    />
  );
}
