// Web PWA identity (app/manifest.ts), re-exported from the shared @rosm/core
// source so web and the Expo app agree on names/colors.
import cfg from "@rosm/core/appConfig.json";

export const APP_NAME = cfg.appName;
export const APP_TAGLINE = cfg.appTagline;
export const PWA_THEME_COLOR = cfg.pwaThemeColor;
