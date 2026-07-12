import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import OutboxSync from "@/components/OutboxSync";
import UndoToast from "@/components/UndoToast";
import NativeAuth from "@/components/NativeAuth";
import NativeChrome from "@/components/NativeChrome";

// Self-hosted so builds never depend on reaching Google Fonts at build time.
const display = localFont({
  src: "./fonts/SpaceGrotesk-Variable.woff2",
  variable: "--font-display",
  weight: "300 700",
  display: "swap",
});

const body = localFont({
  src: "./fonts/Inter-Variable.woff2",
  variable: "--font-body",
  weight: "100 900",
  display: "swap",
});

const APP_NAME = "ROSM";
const APP_DESCRIPTION =
  "Turn your run into open-map fieldwork. Plan a route past unverified OpenStreetMap points, run it with turn-by-turn cues, and fix the map from the ground.";

// Absolute base for resolving OG/twitter image URLs. Prefer an explicit site URL,
// fall back to the Vercel production domain, then the known deploy target.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://rosm.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: APP_NAME,
  title: {
    default: "ROSM — Running for Open-Sourced Maps",
    template: "%s · ROSM",
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f1ebdd",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${display.variable} ${body.variable}`}>
      <body className="min-h-full">
        {children}
        <OutboxSync />
        <UndoToast />
        <ServiceWorkerRegister />
        <NativeAuth />
        <NativeChrome />
      </body>
    </html>
  );
}
