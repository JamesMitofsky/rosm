"use client";

import FountainMap from "@/components/fountains/FountainMap";
import SiteNav from "@/components/SiteNav";

// The public fountain browser: purely for finding drinking water nearby. No OSM
// editing here regardless of sign-in — updating points lives in the connected
// Quick Update surface (/mapping-portal/quick-update).
export default function FountainsPage() {
  return <FountainMap backHref="/" backLabel="Home" nav={<SiteNav />} />;
}
