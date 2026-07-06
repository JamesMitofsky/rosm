"use client";

import type { HTMLAttributes } from "react";

// The floating paper card that hosts panel content over the map.
export default function Panel({ className = "", ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={`border-paper-line bg-paper/95 rounded-2xl border shadow-xl backdrop-blur ${className}`}
      {...rest}
    />
  );
}
