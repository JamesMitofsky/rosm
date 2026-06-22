"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  ArrowRightIcon,
  MapTrifoldIcon,
  PathIcon,
  PersonSimpleRunIcon,
  RulerIcon,
  GlobeHemisphereWestIcon,
  CompassIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

/* ------------------------------------------------------------------ */
/* Real sample route — a 24.5 km foot loop through Columbia Heights,   */
/* Logan Circle, Capitol Hill, the National Mall, and Georgetown,      */
/* visiting 16 real OSM drinking fountains. Geometry generated once    */
/* from OSM (Overpass) + BRouter (hiking-beta), then frozen here.      */
/* ------------------------------------------------------------------ */
const DC_CENTER: [number, number] = [38.9068, -77.0331];

const DC_FOUNTAINS = [
  { id: 1, lat: 38.92548, lon: -77.03205, label: "1" },
  { id: 2, lat: 38.93047, lon: -77.03617, label: "2" },
  { id: 3, lat: 38.91665, lon: -77.02586, label: "3" },
  { id: 4, lat: 38.90981, lon: -77.02821, label: "4" },
  { id: 5, lat: 38.90998, lon: -77.03762, label: "5" },
  { id: 6, lat: 38.88672, lon: -76.99649, label: "6" },
  { id: 7, lat: 38.8831, lon: -76.99871, label: "7" },
  { id: 8, lat: 38.88887, lon: -77.01979, label: "8" },
  { id: 9, lat: 38.88897, lon: -77.02442, label: "9" },
  { id: 10, lat: 38.90495, lon: -77.06792, label: "10" },
  { id: 11, lat: 38.91023, lon: -77.06672, label: "11" },
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

/* ------------------------------------------------------------------ */
/* Decorative topographic contour field.                              */
/* ------------------------------------------------------------------ */
function Contours({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1200 600"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {Array.from({ length: 9 }).map((_, i) => {
        const o = i * 26;
        return (
          <path
            key={i}
            d={`M-50 ${120 + o}
                C 200 ${60 + o}, 360 ${220 + o}, 560 ${180 + o}
                S 920 ${60 + o}, 1260 ${160 + o}`}
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.5 - i * 0.04}
          />
        );
      })}
      {Array.from({ length: 7 }).map((_, i) => {
        const o = i * 30;
        return (
          <path
            key={`b-${i}`}
            d={`M-50 ${420 + o}
                C 180 ${360 + o}, 420 ${520 + o}, 640 ${440 + o}
                S 980 ${360 + o}, 1260 ${480 + o}`}
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.42 - i * 0.05}
          />
        );
      })}
    </svg>
  );
}

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

/* Tiny mono corner label, as in the reference layouts. */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.22em] text-ink-dim">
      {children}
    </span>
  );
}

const STEPS = [
  {
    icon: MapTrifoldIcon,
    n: "01",
    title: "Set a center point",
    body: "Search an address, tap the map, or use your live location. OSM features matching a tag (default amenity=drinking_water) are fetched within a radius via the Overpass API.",
  },
  {
    icon: RulerIcon,
    n: "02",
    title: "Set a target distance",
    body: "Choose how far to run. A distance-bounded subset of the fetched points is selected, so a large area can be split across multiple runs.",
  },
  {
    icon: PathIcon,
    n: "03",
    title: "Generate the route",
    body: "Selected points are ordered and threaded into a runnable footpath route via the BRouter pedestrian routing engine (foot-fast profile). Loop or one-way.",
  },
  {
    icon: PersonSimpleRunIcon,
    n: "04",
    title: "Run and record",
    body: "Run the route with turn-toward-next-point guidance. At each point, record its state — written back to OSM under a single changeset.",
  },
];

export default function LandingPage() {
  return (
    <main className="paper-grain relative bg-paper font-body text-ink">
      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-paper-line bg-paper/85 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-5">
            <span className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon.svg" alt="" className="h-7 w-7" />
              <span className="font-display text-lg font-bold tracking-tight">ROSM</span>
            </span>
            <span className="hidden font-mono text-[0.65rem] uppercase tracking-[0.22em] text-ink-dim sm:inline">
              Running for Open-Sourced Maps
            </span>
          </Link>
          <Link
            href="/plan"
            className="rounded-full border border-ink bg-ink px-5 py-2 text-sm font-bold text-paper transition hover:bg-transparent hover:text-ink"
          >
            Plan a route
          </Link>
        </nav>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <Contours className="pointer-events-none absolute inset-0 h-full w-full text-ink/[0.06]" />

        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-14 md:pb-24 md:pt-20">
          <motion.h1
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.05 }}
            className="max-w-5xl font-display text-[clamp(2.6rem,8.5vw,6.5rem)] font-bold uppercase leading-[0.9] tracking-tight"
          >
            Contribute to <span className="text-sky-deep">public maps</span>
            <br />
            on your runs
          </motion.h1>

          <div className="mt-10 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
            <motion.p
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.12 }}
              className="max-w-xl text-lg leading-relaxed text-ink-dim"
            >
              Runners already visit every corner of the city—updating
              community data is a match made in heaven.
            </motion.p>

            <motion.div
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.18 }}
            >
              <Link
                href="/plan"
                className="group flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-base font-bold text-paper transition hover:gap-3"
              >
                Plan a route
                <ArrowRightIcon size={18} weight="bold" className="transition-transform group-hover:translate-x-1" />
              </Link>
            </motion.div>
          </div>

          {/* Sample-route label, sitting tightly above the map plate. */}
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.24 }}
            className="mt-14 flex items-center justify-between gap-4 px-1 pb-2"
          >
            <Label>Washington DC</Label>
            <Label>11 fountains</Label>
          </motion.div>

          {/* Sky panel — a real sample route, framed like a print plate. */}
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.28 }}
            className="relative overflow-hidden rounded-[2rem] border border-ink/10 bg-sky"
          >
            <div className="relative isolate z-0 h-[clamp(260px,38vw,420px)] w-full">
              <MapView
                className="hero-map"
                center={DC_CENTER}
                zoom={12}
                minZoom={12}
                maxZoom={18}
                line={DC_ROUTE}
                markers={DC_FOUNTAINS.map((f) => ({ ...f, color: "#0c0d0a" }))}
              />
            </div>
          </motion.div>
        </div>
      </section>

      {/* MANIFESTO SPLIT */}
      <section className="border-t border-paper-line bg-paper-deep">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:grid-cols-2 md:py-28">
          <motion.div {...fadeUp}>
            <h2 className="font-display text-[clamp(2rem,5vw,3.4rem)] font-bold leading-[1.05] tracking-tight">
              ROSM makes it easy for runners to contribute to a
              <span className="text-sky-deep"> public resource</span>
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-ink-dim">
              Crowdsourced map data degrades over time. Point features — drinking
              fountains, benches, and similar nodes — are tagged once and rarely
              rechecked. Aerial imagery can&apos;t confirm whether a fountain still
              works or a node still exists on the ground.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-ink-dim">
              ROSM closes the loop by routing runs past unverified points so their
              real-world state can be observed and recorded easily into OSM.
            </p>
          </motion.div>

          <motion.ul {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }} className="flex flex-col gap-4">
            {[
              { icon: CompassIcon, h: "On-foot guidance", b: "Mobile-first run view: live distance and a compass arrow pointing toward the next point on the route." },
              { icon: CheckCircleIcon, h: "OSM lifecycle mapping", b: "Working sets check_date; out-of-order moves the tag to disused:; removed moves it to abandoned: — each stamped with today's date." },
              { icon: GlobeHemisphereWestIcon, h: "Single attributed changeset", b: "All edits from one run commit under one OSM changeset, attributed to your OSM account via OAuth2." },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <li key={f.h} className="flex gap-4 rounded-2xl border border-paper-line bg-paper p-5">
                  <Icon size={28} weight="bold" className="mt-0.5 shrink-0 text-sky-deep" />
                  <div>
                    <h3 className="font-display font-semibold">{f.h}</h3>
                    <p className="mt-1 text-sm text-ink-dim">{f.b}</p>
                  </div>
                </li>
              );
            })}
          </motion.ul>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="border-t border-paper-line">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <motion.div {...fadeUp}>
            <h2 className="font-display text-[clamp(2rem,5.5vw,3.6rem)] font-bold uppercase leading-tight tracking-tight">
              How it works
            </h2>
          </motion.div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-paper-line bg-paper-line sm:grid-cols-2">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.n}
                  className="group relative bg-paper p-8 transition hover:bg-paper-deep"
                >
                  <div className="flex items-start justify-between">
                    <Icon size={36} weight="duotone" className="text-sky-deep" />
                    <span className="font-display text-5xl font-bold text-ink/10">
                      {step.n}
                    </span>
                  </div>
                  <h3 className="mt-6 font-display text-xl font-semibold">{step.title}</h3>
                  <p className="mt-2 text-ink-dim">{step.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative overflow-hidden border-t border-paper-line">
        <Contours className="pointer-events-none absolute inset-0 h-full w-full text-ink/[0.05]" />
        <div className="relative mx-auto max-w-5xl px-5 py-24 text-center md:py-32">
          <motion.div {...fadeUp} className="mt-10">
            <Link
              href="/plan"
              className="group inline-flex items-center gap-2 rounded-full bg-ink px-9 py-4 text-lg font-bold text-paper transition hover:gap-3"
            >
              Plan a route
              <ArrowRightIcon size={20} weight="bold" className="transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-paper-line">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-4 px-5 py-8 text-sm text-ink-dim">
          <span>
            Made with <span className="text-sky-deep">♥</span> by{" "}
            <a
              href="https://btv.dev/about"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-ink underline decoration-sky-deep/50 underline-offset-4 hover:decoration-sky-deep"
            >
              James Mitofsky
            </a>
          </span>
        </div>
      </footer>
    </main>
  );
}
