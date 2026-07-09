"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNative } from "@/lib/api";

// The marketing landing page is web-only. In the native app there is no "marketing"
// surface — boot straight into the planner. Rendered (returning null) at the top of
// the landing page so it runs on first mount.
export default function NativeEntryRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (isNative()) router.replace("/mapping-portal");
  }, [router]);
  return null;
}
