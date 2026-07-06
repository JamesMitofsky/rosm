"use client";

import type { ReactNode } from "react";

// Inline error box with an optional retry action. `tone` matches the surface:
// "dark" for panels over the dark paper background (planner), "light" for
// light panels (fountain browser).
export default function ErrorNotice({
  message,
  tone = "dark",
  onRetry,
  retrying = false,
  retryLabel = "Try again",
  retryingLabel = "Trying…",
  children,
}: {
  message: string;
  tone?: "dark" | "light";
  onRetry?: () => void;
  retrying?: boolean;
  retryLabel?: string;
  retryingLabel?: string;
  children?: ReactNode;
}) {
  const text = tone === "dark" ? "text-red-300" : "text-red-700";
  const retry =
    tone === "dark" ? "text-red-200 hover:bg-red-500/20" : "text-red-600 hover:bg-red-500/10";
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm ${text}`}
    >
      <span>{message}</span>
      {children}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className={`self-start rounded-md border border-red-500/40 px-2 py-1 text-xs font-medium disabled:opacity-50 ${retry}`}
        >
          {retrying ? retryingLabel : retryLabel}
        </button>
      )}
    </div>
  );
}
