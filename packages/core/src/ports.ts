// Platform capabilities that each app injects at startup. The stores and other
// core modules call these through the registry in ./configure.ts, so nothing in
// @water-run/core reaches for a browser or Expo API directly.
//
// Only the ports the core runtime actually calls live in CorePorts. The rest are
// contract types each app implements and consumes in its own UI layer, kept here
// so the web and mobile adapters can `satisfies`-check against one definition.
import type { OutboxItem } from "./stores/outbox";
import type { ProgressLine } from "./runProgress";

export type GeoPoint = {
  lat: number;
  lon: number;
  heading: number | null; // travel direction in degrees, present only while moving
  accuracy?: number;
};

export type GeoWatch = { clear: () => void };

// -- Ports the core runtime calls (the injected registry) --------------------

export type ApiFetchOptions = {
  // Hard ceiling on the whole request. On expiry the request is aborted and the
  // call rejects with ApiTimeoutError (./apiResponse). Without one, a half-open
  // connection can hang for many minutes on a phone (Android's OkHttp has no
  // read timeout by default). Omit to wait indefinitely.
  timeoutMs?: number;
};

export type ApiPort = {
  // Talk to the Water Run backend (the Astro /api endpoints). Web sends the
  // httpOnly OSM cookie (same origin); mobile prefixes an absolute base and
  // attaches the OSM bearer token.
  apiFetch: (path: string, init?: RequestInit, opts?: ApiFetchOptions) => Promise<Response>;
};

// Small synchronous key/value store (route archive + planner draft). localStorage
// on web, expo-sqlite/kv-store's sync API on mobile.
export type KvPort = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
};

// The offline outbox: one record per queued edit plus a tiny meta kv. IndexedDB
// on web, expo-sqlite on mobile.
export type OutboxStoragePort = {
  getAll: () => Promise<OutboxItem[]>;
  put: (item: OutboxItem) => Promise<void>;
  delete: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  getMeta: <T>(key: string) => Promise<T | undefined>;
  setMeta: <T>(key: string, value: T | undefined) => Promise<void>;
};

export type GeolocationPort = {
  getCurrentPosition: (opts?: { highAccuracy?: boolean }) => Promise<GeoPoint>;
};

export type CorePorts = {
  api: ApiPort;
  kv: KvPort;
  outboxStorage: OutboxStoragePort;
  geolocation: GeolocationPort;
};

// -- Contract-only ports (implemented and consumed inside each app) ----------

export type GeolocationWatchPort = {
  // Live run tracking. Web watches foreground; mobile runs a background task.
  watchRunPosition: (
    onPoint: (p: GeoPoint) => void,
    onError: (msg: string) => void,
  ) => Promise<GeoWatch>;
};

export type HapticsPort = { success: () => void };

export type SharePort = {
  canShare: () => boolean;
  share: (opts: { title: string; text: string; url: string }) => Promise<void>;
};

export type KeepAwakePort = { keepAwake: () => void; allowSleep: () => void };

export type NotifyPort = {
  ensurePermission: () => Promise<boolean>;
  proximity: (name: string, meters: number) => void;
  runComplete: (count: number) => void;
  syncPending: (count: number) => void;
};

// What the run's Live Activity shows; runProgress's runActivityState builds it.
// Flat and already formatted, because the activity's layout runs apart from the
// app (in the widget extension) and can use nothing but these props.
export type RunActivityState = {
  stopName: string;
  leg: string; // where the runner is in the run: "Stop 3 of 8", or "Back to start"
  stopDist: string; // "0.3 mi"
  // stopDist split in two, stacked to fit the Dynamic Island's 28 pt
  // limited-width views: "0.3" over "mi".
  stopDistValue: string;
  stopDistUnit: string;
  turn: string | null; // "Left in 250 ft"; null when no turn is left before the stop
  turnSide: "left" | "right" | null;
};

// show() returns whether the activity is carrying the run's progress, so the
// caller knows whether to fall back to another surface.
export type LiveActivityPort = {
  show: (line: ProgressLine, s: RunActivityState) => boolean;
  end: () => void;
};

export type CelebratePort = { celebratePoint: () => void };
