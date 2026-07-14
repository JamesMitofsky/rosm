"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import SiteNav from "@/components/SiteNav";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "200px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

// Q&A content for the FAQ page. Each entry animates in as its own block.
const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "How is this different from other fountain maps?",
    a: (
      <>
        <p>
          As someone using the map, it is easier to trust that this map is kept up to date—in fact,
          it requires no faith, since you can see how long ago a fountain was verified. From the
          perspective of a community maintainer contributing to the map, this being a decentralized
          piece of information means there is no bottleneck for updating the map. Anyone can make a
          contribution to the map in real time. And even if—EVEN IF—the whole Fountain Mapper
          project blew up and vanished, the data and contribution history is actually stored with
          the long-established and well-reputed OpenStreetMap.
        </p>
      </>
    ),
  },
  {
    q: "What is OpenStreetMap?",
    a: (
      <>
        <p>
          OpenStreetMap (OSM) is the Wikipedia of mapping—a crowd-sourced, openly licensed
          alternative to Big Map. Instead of one company owning the map, anyone can add and verify
          places, and the data belongs to the public. Fountain Mapper writes every fountain update
          straight to OSM, so the information lives somewhere durable and open.
        </p>
      </>
    ),
  },
  {
    q: "How does authentication work?",
    a: (
      <>
        <p>
          The authentication approach taken by Fountain Mapper is different from most apps. You can
          think of Fountain Mapper as a wrapper around the OpenStreetMap (OSM) platform. For
          example, if you were to mark a fountain as <em>out of order</em>, Fountain Mapper formats
          that information and immediately submits it to OSM. In this way, Fountain Mapper retains
          no information about the people who use it—your authentication is completely local to your
          device, and it creates a portal for you to interact with OSM.
        </p>
        <p>
          If you wanted to see the complete history of updates you submitted to OSM, you would want
          to look at{" "}
          <a
            href="https://www.openstreetmap.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-deep underline"
          >
            your OSM account
          </a>
          .
        </p>
        <p>
          All this is to say: you need to create an account through OSM instead of Fountain Mapper
          because OSM is the place your information really lives. The only thing Fountain Mapper
          does is facilitate a very specific type of data manipulation. Because the UI for OSM is
          meant to support updating information about buildings and roads and businesses and
          countries, it needs to take a pretty general approach to the design. Fountain Mapper
          simplifies the many clicks it would take to update a fountain into just a few, and then it
          ships that information off to OSM to be safely recorded for public use.
        </p>
      </>
    ),
  },
  {
    q: "How can I contribute?",
    a: (
      <>
        <p>
          If you want to share feedback on your experience using Fountain Mapper, email me at{" "}
          <a href="mailto:james@btv.dev" className="text-sky-deep underline">
            james@btv.dev
          </a>
          ! And if you have a little experience writing code, feel free to{" "}
          <a
            href="https://github.com/JamesMitofsky/rosm"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-deep underline"
          >
            make a pull request
          </a>
          !
        </p>
      </>
    ),
  },
  {
    q: "What's next for Fountain Mapper?",
    a: (
      <>
        <p>
          Right now, the focus is on documenting fountains as a public amenity, and once this proof
          of concept is locked down, branching out to recording and maintaining data for other
          public amenities. Things like public restrooms, picnic tables, parks, bike racks, etc.
        </p>
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <main className="paper-grain bg-paper font-body text-ink relative">
      <SiteNav />

      <section className="mx-auto max-w-2xl px-5 py-16 md:py-24">
        <motion.h1
          {...fadeUp}
          className="font-display text-[clamp(2rem,6vw,3.4rem)] leading-[0.95] font-bold tracking-tight"
        >
          FAQ
        </motion.h1>

        <div className="mt-12 flex flex-col gap-12">
          {FAQS.map((f, i) => (
            <motion.div
              key={f.q}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.08 + i * 0.06 }}
            >
              <h2 className="font-display text-[clamp(1.4rem,3.5vw,2rem)] leading-tight font-bold tracking-tight">
                {f.q}
              </h2>
              <div className="text-ink-dim mt-5 flex flex-col gap-5 text-lg leading-relaxed">
                {f.a}
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </main>
  );
}
