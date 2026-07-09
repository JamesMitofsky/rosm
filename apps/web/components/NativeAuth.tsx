"use client";

import { useEffect } from "react";
import { initOsmAuth } from "@/lib/osmAuth";

// App-wide native auth bootstrap: loads the persisted OSM token and starts the
// OAuth deep-link listener on first mount. No-op on web.
export default function NativeAuth() {
  useEffect(() => {
    initOsmAuth();
  }, []);
  return null;
}
