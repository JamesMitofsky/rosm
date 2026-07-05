"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useAnimationControls, useDragControls } from "framer-motion";

// Mobile-only draggable bottom sheet with two snap points (peek / full). The
// `head` region stays visible when peeked; `body` scrolls when expanded. Only the
// grab handle initiates a drag, so tapping controls / scrolling the list is free.
export default function BottomSheet({ head, body }: { head: ReactNode; body: ReactNode }) {
  const controls = useAnimationControls();
  const drag = useDragControls();
  const sheetRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const [collapseOffset, setCollapseOffset] = useState(0);
  const [snap, setSnap] = useState<"peek" | "full">("peek");

  // Peek shows only the handle + head; collapse distance is the rest of the sheet.
  useEffect(() => {
    const measure = () => {
      const sh = sheetRef.current?.offsetHeight ?? 0;
      const ph = peekRef.current?.offsetHeight ?? 0;
      setCollapseOffset(Math.max(0, sh - ph));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (sheetRef.current) ro.observe(sheetRef.current);
    if (peekRef.current) ro.observe(peekRef.current);
    return () => ro.disconnect();
  }, []);

  // Keep the resting position correct once measured / when content resizes.
  useEffect(() => {
    if (collapseOffset > 0) controls.set({ y: snap === "full" ? 0 : collapseOffset });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseOffset]);

  const snapTo = (s: "peek" | "full") => {
    setSnap(s);
    controls.start({
      y: s === "full" ? 0 : collapseOffset,
      transition: { type: "spring", stiffness: 420, damping: 40 },
    });
  };

  return (
    <motion.div
      ref={sheetRef}
      drag="y"
      dragControls={drag}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: collapseOffset }}
      dragElastic={0.06}
      initial={{ y: "55%" }}
      animate={controls}
      onDrag={() => {
        moved.current = true;
      }}
      onDragEnd={(_, info) => {
        if (info.velocity.y > 300) return snapTo("peek");
        if (info.velocity.y < -300) return snapTo("full");
        if (snap === "full") return snapTo(info.offset.y > 60 ? "peek" : "full");
        return snapTo(info.offset.y < -60 ? "full" : "peek");
      }}
      className="safe-pb border-paper-line bg-paper/95 fixed inset-x-0 bottom-0 z-[1000] flex h-[88dvh] flex-col rounded-t-2xl border-t shadow-xl backdrop-blur md:hidden"
    >
      <div ref={peekRef} className="shrink-0">
        <div
          role="button"
          tabIndex={0}
          aria-label="Expand or collapse panel"
          onPointerDown={(e) => {
            moved.current = false;
            drag.start(e);
          }}
          onClick={() => {
            if (!moved.current) snapTo(snap === "full" ? "peek" : "full");
          }}
          className="flex cursor-grab touch-none justify-center py-3 active:cursor-grabbing"
        >
          <div className="bg-paper-line h-1.5 w-10 rounded-full" />
        </div>
        <div className="px-5">{head}</div>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-3 pb-4">{body}</div>
    </motion.div>
  );
}
