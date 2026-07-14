// Single source of truth for app identity, shared by the Capacitor native config
// (capacitor.config.ts) and the web PWA manifest (app/manifest.ts). Plain module —
// no framework imports — so both the Next.js build and the Capacitor CLI loader can
// read it. Capacitor is the point of truth; the manifest/native config derive here.

export const APP_ID = "org.rosm.app";
export const APP_NAME = "Fountain Mapper";
export const APP_TAGLINE = "Running for Open-Sourced Maps";

// OAuth deep-link scheme (also registered in ios Info.plist CFBundleURLTypes).
export const APP_SCHEME = "rosm";

// Native launch chrome (splash + status bar) — dark, matches the boot screen.
export const NATIVE_BACKGROUND = "#0c0d0a";

// Web PWA theme + background — warm paper, matches the landing.
export const PWA_THEME_COLOR = "#f1ebdd";
