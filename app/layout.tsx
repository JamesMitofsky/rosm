import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import OutboxSync from "@/components/OutboxSync";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const APP_NAME = "ROSM";
const APP_DESCRIPTION =
  "Turn your run into open-map fieldwork. Plan a route past unverified OpenStreetMap points, run it with turn-by-turn cues, and fix the map from the ground.";

export const metadata: Metadata = {
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
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
