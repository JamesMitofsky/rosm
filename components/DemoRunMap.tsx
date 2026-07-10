"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { MapMarker } from "@/components/MapView";
import PointPopup, { type PointEdit } from "@/components/PointPopup";
import type { EditAction, EditExtras, Fountain } from "@/lib/schemas";
import type { StopStatus } from "@/store/run";
import { editSummary, todayLocal } from "@/lib/editSummary";
import { celebratePoint } from "@/lib/confetti";
import { bearing } from "@/lib/geo";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

/* ------------------------------------------------------------------ */
/* Real sample route — a 24.5 km foot loop through Columbia Heights,   */
/* Logan Circle, Capitol Hill, the National Mall, and Georgetown,      */
/* visiting real OSM drinking fountains. Geometry generated once from  */
/* OSM (Overpass) + BRouter (hiking-beta), then frozen here.           */
/*                                                                     */
/* The map is a sandboxed replica of the run screen: same markers,     */
/* same popup, same status colors — but every "edit" lives only in     */
/* component state. Nothing is written to OSM, the outbox, or disk.    */
/* ------------------------------------------------------------------ */
const DC_CENTER: [number, number] = [38.9068, -77.0331];

const DC_FOUNTAINS: Fountain[] = [
  {
    id: 1,
    lat: 38.92548,
    lon: -77.03205,
    tags: { name: "Meridian Hill Park", check_date: "2019-06-14" },
  },
  { id: 2, lat: 38.93047, lon: -77.03617, tags: { name: "Upshur Park" } },
  {
    id: 3,
    lat: 38.91665,
    lon: -77.02586,
    tags: { name: "LeDroit Park", check_date: "2021-03-02" },
  },
  {
    id: 4,
    lat: 38.90981,
    lon: -77.02821,
    tags: { name: "Logan Circle", check_date: "2018-09-27" },
  },
  { id: 5, lat: 38.90998, lon: -77.03762, tags: { name: "Stead Park" } },
  {
    id: 6,
    lat: 38.88672,
    lon: -76.99649,
    tags: { name: "Lincoln Park", check_date: "2020-05-11" },
  },
  { id: 7, lat: 38.8831, lon: -76.99871, tags: { name: "Folger Park" } },
  {
    id: 8,
    lat: 38.88887,
    lon: -77.01979,
    tags: { name: "National Mall", check_date: "2017-08-19" },
  },
  { id: 9, lat: 38.88897, lon: -77.02442, tags: { name: "Smithsonian Castle" } },
  { id: 10, lat: 38.90495, lon: -77.06792, tags: { name: "Georgetown Waterfront" } },
  {
    id: 11,
    lat: 38.91023,
    lon: -77.06672,
    tags: { name: "Montrose Park", check_date: "2022-11-03" },
  },
];

const DC_ROUTE: [number, number][] = [
  [38.92547, -77.03219],
  [38.92645, -77.03256],
  [38.92627, -77.03548],
  [38.92621, -77.03637],
  [38.92629, -77.03663],
  [38.92648, -77.03676],
  [38.92677, -77.03714],
  [38.92702, -77.03682],
  [38.92717, -77.03682],
  [38.92785, -77.0366],
  [38.92877, -77.0366],
  [38.93042, -77.03659],
  [38.93041, -77.03621],
  [38.92986, -77.03634],
  [38.92867, -77.0361],
  [38.92718, -77.03546],
  [38.9267, -77.03543],
  [38.92626, -77.03541],
  [38.92528, -77.03535],
  [38.9248, -77.03456],
  [38.92444, -77.03423],
  [38.92262, -77.03397],
  [38.92265, -77.03266],
  [38.92236, -77.03189],
  [38.92114, -77.03011],
  [38.92064, -77.02961],
  [38.92048, -77.02948],
  [38.91926, -77.02888],
  [38.91915, -77.02818],
  [38.91805, -77.02808],
  [38.91711, -77.028],
  [38.91712, -77.02698],
  [38.91691, -77.02693],
  [38.91665, -77.02591],
  [38.91567, -77.02627],
  [38.91551, -77.02636],
  [38.91477, -77.02692],
  [38.91459, -77.02717],
  [38.91403, -77.02719],
  [38.91375, -77.02717],
  [38.91343, -77.02719],
  [38.91276, -77.02767],
  [38.91255, -77.02773],
  [38.91186, -77.02818],
  [38.91121, -77.02817],
  [38.91032, -77.02816],
  [38.91008, -77.0282],
  [38.90972, -77.02873],
  [38.90957, -77.02877],
  [38.90969, -77.02942],
  [38.90978, -77.02975],
  [38.90973, -77.03036],
  [38.90972, -77.03082],
  [38.90973, -77.0318],
  [38.90977, -77.03212],
  [38.90975, -77.03466],
  [38.90972, -77.03638],
  [38.90973, -77.03721],
  [38.90973, -77.03644],
  [38.90942, -77.03641],
  [38.90866, -77.03633],
  [38.90756, -77.03627],
  [38.90733, -77.03604],
  [38.90714, -77.0358],
  [38.90695, -77.03535],
  [38.90651, -77.03472],
  [38.90637, -77.03434],
  [38.90572, -77.03263],
  [38.90577, -77.03247],
  [38.9056, -77.0321],
  [38.90533, -77.03195],
  [38.90521, -77.03178],
  [38.90505, -77.03065],
  [38.90467, -77.02949],
  [38.90422, -77.02817],
  [38.90395, -77.02734],
  [38.9037, -77.02719],
  [38.90368, -77.02691],
  [38.9035, -77.02607],
  [38.90331, -77.02552],
  [38.90282, -77.0241],
  [38.90285, -77.02381],
  [38.90288, -77.02278],
  [38.90241, -77.02229],
  [38.90223, -77.02179],
  [38.90205, -77.02122],
  [38.90165, -77.02005],
  [38.90143, -77.0194],
  [38.90141, -77.01901],
  [38.90133, -77.01881],
  [38.90064, -77.01719],
  [38.90037, -77.01626],
  [38.90026, -77.01574],
  [38.89998, -77.01515],
  [38.89975, -77.01449],
  [38.89945, -77.01354],
  [38.89925, -77.01305],
  [38.89899, -77.01231],
  [38.89875, -77.01188],
  [38.89841, -77.01106],
  [38.89819, -77.01049],
  [38.89772, -77.00923],
  [38.89724, -77.00813],
  [38.89717, -77.00779],
  [38.89713, -77.00763],
  [38.89723, -77.00732],
  [38.89681, -77.00542],
  [38.89652, -77.00526],
  [38.89588, -77.00487],
  [38.89539, -77.00363],
  [38.89496, -77.00264],
  [38.8948, -77.00204],
  [38.89454, -77.0016],
  [38.8942, -77.00071],
  [38.8942, -77.00051],
  [38.89405, -77.00048],
  [38.89373, -76.9999],
  [38.89344, -76.99962],
  [38.89338, -76.99899],
  [38.89311, -76.99855],
  [38.89299, -76.99846],
  [38.89237, -76.99677],
  [38.89202, -76.99627],
  [38.88991, -76.99626],
  [38.88863, -76.99626],
  [38.88753, -76.99624],
  [38.88725, -76.99632],
  [38.88651, -76.99635],
  [38.88644, -76.99618],
  [38.88521, -76.99617],
  [38.88468, -76.9956],
  [38.88441, -76.99507],
  [38.88431, -76.9947],
  [38.88438, -76.99411],
  [38.88437, -76.99485],
  [38.88441, -76.99507],
  [38.88405, -76.9951],
  [38.88407, -76.99548],
  [38.88396, -76.99571],
  [38.8838, -76.99608],
  [38.8832, -76.99836],
  [38.88314, -76.99867],
  [38.88315, -77.00067],
  [38.88315, -77.00213],
  [38.88315, -77.0036],
  [38.88316, -77.00598],
  [38.88323, -77.00647],
  [38.88339, -77.00652],
  [38.88333, -77.00686],
  [38.88334, -77.00822],
  [38.88389, -77.00897],
  [38.88411, -77.00928],
  [38.88517, -77.01071],
  [38.88609, -77.01191],
  [38.88633, -77.01223],
  [38.88719, -77.01331],
  [38.88757, -77.01353],
  [38.88768, -77.01505],
  [38.88804, -77.01535],
  [38.88817, -77.01582],
  [38.88848, -77.01604],
  [38.88856, -77.01664],
  [38.88868, -77.01716],
  [38.88885, -77.01742],
  [38.88888, -77.01765],
  [38.88905, -77.01987],
  [38.89045, -77.02169],
  [38.89045, -77.02216],
  [38.88931, -77.02394],
  [38.88897, -77.02445],
  [38.88923, -77.02531],
  [38.89039, -77.02584],
  [38.89032, -77.03176],
  [38.89009, -77.03291],
  [38.88994, -77.03326],
  [38.89016, -77.03418],
  [38.89009, -77.03507],
  [38.89018, -77.0359],
  [38.89002, -77.03657],
  [38.89007, -77.03705],
  [38.89071, -77.03769],
  [38.89156, -77.03857],
  [38.89194, -77.03948],
  [38.89223, -77.04077],
  [38.89276, -77.04174],
  [38.89353, -77.04314],
  [38.89377, -77.04364],
  [38.89465, -77.04511],
  [38.89543, -77.04655],
  [38.89593, -77.04758],
  [38.89611, -77.0479],
  [38.89664, -77.04887],
  [38.89724, -77.04997],
  [38.89799, -77.05135],
  [38.89827, -77.05184],
  [38.89841, -77.05211],
  [38.89895, -77.05309],
  [38.89929, -77.0538],
  [38.8994, -77.05405],
  [38.9005, -77.05601],
  [38.90048, -77.05624],
  [38.90049, -77.05652],
  [38.90078, -77.05704],
  [38.90091, -77.05735],
  [38.90104, -77.05799],
  [38.9008, -77.05844],
  [38.90088, -77.05903],
  [38.90121, -77.06006],
  [38.90155, -77.06111],
  [38.90171, -77.06134],
  [38.90245, -77.06266],
  [38.9028, -77.06394],
  [38.90358, -77.06645],
  [38.90433, -77.06794],
  [38.90458, -77.0678],
  [38.90498, -77.06793],
  [38.90494, -77.06856],
  [38.90514, -77.06883],
  [38.90584, -77.06906],
  [38.90641, -77.07029],
  [38.90692, -77.07085],
  [38.90742, -77.07126],
  [38.90762, -77.0717],
  [38.90771, -77.07205],
  [38.90775, -77.07173],
  [38.90862, -77.07164],
  [38.90872, -77.06918],
  [38.90881, -77.06792],
  [38.90982, -77.06701],
  [38.91022, -77.06673],
  [38.91077, -77.06612],
  [38.91081, -77.06504],
  [38.9105, -77.06438],
  [38.91052, -77.06373],
  [38.91055, -77.06189],
  [38.91058, -77.05918],
  [38.91061, -77.05723],
  [38.91063, -77.05587],
  [38.91067, -77.05303],
  [38.91074, -77.05153],
  [38.91112, -77.05082],
  [38.91122, -77.05057],
  [38.91141, -77.04892],
  [38.91163, -77.0488],
  [38.91172, -77.04875],
  [38.9121, -77.04819],
  [38.91267, -77.04765],
  [38.9133, -77.04725],
  [38.91362, -77.04707],
  [38.91403, -77.04674],
  [38.91441, -77.04635],
  [38.91454, -77.04612],
  [38.9159, -77.04615],
  [38.9163, -77.0462],
  [38.9177, -77.04552],
  [38.91862, -77.04496],
  [38.91918, -77.04459],
  [38.91967, -77.04426],
  [38.92013, -77.04404],
  [38.9203, -77.04395],
  [38.92047, -77.04387],
  [38.92067, -77.04377],
  [38.92206, -77.04318],
  [38.92232, -77.04298],
  [38.92255, -77.04254],
  [38.923, -77.04199],
  [38.92315, -77.0418],
  [38.92397, -77.04056],
  [38.92481, -77.03919],
  [38.92474, -77.03847],
  [38.92477, -77.03781],
  [38.92486, -77.03539],
  [38.92536, -77.0338],
  [38.92547, -77.03219],
];

// Same palette as the live run screen (hooks/useRunSession).
const STATUS_COLOR: Record<StopStatus, string> = {
  pending: "#9ca3af",
  confirm: "#16a34a",
  dog_only: "#7c3aed",
  out_of_order: "#d97706",
  removed: "#dc2626",
  skipped: "#6b7280",
};

// The demo joins the run "mid-way": the first stops are already surveyed so a
// visitor immediately sees done vs. upcoming, and the runner dot sits on the
// approach to the next target.
const SEED_STATUSES: Record<number, StopStatus> = {
  1: "confirm",
  2: "confirm",
  3: "out_of_order",
  4: "confirm",
  5: "dog_only",
  6: "confirm",
  7: "removed",
  8: "confirm",
};

function seedEdits(): Record<number, PointEdit> {
  const today = todayLocal();
  const entries = Object.entries(SEED_STATUSES).map(([id, status]) => [
    Number(id),
    {
      status,
      summary: editSummary(status as EditAction, "amenity", today),
      syncState: "sent" as const,
    },
  ]);
  return Object.fromEntries(entries);
}

function nearestRouteIdx(pt: { lat: number; lon: number }): number {
  let best = 0;
  let bestD = Infinity;
  DC_ROUTE.forEach(([lat, lon], i) => {
    const d = (lat - pt.lat) ** 2 + (lon - pt.lon) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

// Interactive replica of the run screen for the landing hero. Every tap flows
// through the real PointPopup, but edits only touch local state — nothing is
// sent to OSM, queued in the outbox, or persisted anywhere.
export default function DemoRunMap({ className }: { className?: string }) {
  // Leaflet's zoom is initial-only, so pick it once at mount. Same breakpoint
  // as the hero-map zoom-control CSS (md, 768px).
  const [zoom] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? 11 : 12,
  );
  const [statuses, setStatuses] = useState<Record<number, StopStatus>>(SEED_STATUSES);
  const [edits, setEdits] = useState<Record<number, PointEdit>>(seedEdits);

  // Current target = first unsurveyed stop along the route, exactly like the
  // real run advancing through its stop list.
  const currentIdx = DC_FOUNTAINS.findIndex((f) => !statuses[f.id]);
  const target = currentIdx === -1 ? null : DC_FOUNTAINS[currentIdx];
  const surveyed = DC_FOUNTAINS.length - DC_FOUNTAINS.filter((f) => !statuses[f.id]).length;

  function record(f: Fountain, action: EditAction, extras?: EditExtras) {
    setStatuses((s) => ({ ...s, [f.id]: action as StopStatus }));
    setEdits((e) => ({
      ...e,
      [f.id]: {
        status: action as StopStatus,
        summary: editSummary(action, "amenity", todayLocal(), extras),
        syncState: "pending",
        extras,
      },
    }));
    celebratePoint();
    // Fake the offline-first outbox: "saved · sending…" flips to "sent to OSM"
    // a beat later, without any network involved.
    setTimeout(() => {
      setEdits((e) => (e[f.id] ? { ...e, [f.id]: { ...e[f.id], syncState: "sent" } } : e));
    }, 900);
  }

  // Simulated runner: parked on the route a few segments before the current
  // target, cone pointing along the direction of travel. Advances as points
  // get recorded.
  const { userPos, userHeading } = useMemo(() => {
    const ti = target ? nearestRouteIdx(target) : DC_ROUTE.length - 1;
    const ui = Math.max(0, ti - 8);
    const [lat, lon] = DC_ROUTE[ui];
    const [nlat, nlon] = DC_ROUTE[Math.min(ui + 1, DC_ROUTE.length - 1)];
    return {
      userPos: [lat, lon] as [number, number],
      userHeading: bearing({ lat, lon }, { lat: nlat, lon: nlon }),
    };
  }, [target]);

  const markers: MapMarker[] = DC_FOUNTAINS.map((f, i) => ({
    id: f.id,
    lat: f.lat,
    lon: f.lon,
    color: i === currentIdx ? "#2563eb" : STATUS_COLOR[statuses[f.id] ?? "pending"],
    label: String(i + 1),
    popup: (
      <PointPopup
        fountain={f}
        loggedIn
        edit={edits[f.id]}
        busy={false}
        onAction={(action, extras) => record(f, action, extras)}
      />
    ),
  }));

  return (
    <div className={`relative h-full w-full ${className ?? ""}`}>
      <MapView
        className="hero-map"
        center={DC_CENTER}
        zoom={zoom}
        minZoom={8}
        maxZoom={18}
        line={DC_ROUTE}
        markers={markers}
        userPos={userPos}
        userHeading={userHeading}
      />
      {/* Chips sit above tiles/markers (z ≤ 600) but below open popups (z 700). */}
      <div className="border-ink/10 bg-paper/90 text-ink pointer-events-none absolute top-3 right-3 z-[650] rounded-full border px-2 py-0.5 font-mono text-[0.55rem] font-medium tracking-[0.14em] uppercase backdrop-blur-sm">
        {target ? `${surveyed}/${DC_FOUNTAINS.length} recorded` : "Route complete ✓"}
      </div>
    </div>
  );
}
