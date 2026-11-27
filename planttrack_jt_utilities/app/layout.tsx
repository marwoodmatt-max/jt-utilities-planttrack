import type { Metadata } from "next";
import "./globals.css";
import PwaRegistration from "../components/pwa-registration";
export const metadata: Metadata = {
  title: "PlantTrack | JT Utilities LTD",
  description: "Plant, inspections, LOLER and workshop maintenance management.",
  manifest: "/manifest.webmanifest",
  applicationName: "JT Utilities PlantTrack",
  icons: { icon: [{ url: "/planttrack-icon.svg", type: "image/svg+xml" }], apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
  appleWebApp: { capable: true, title: "PlantTrack", statusBarStyle: "default" }
};
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en-GB"><body><PwaRegistration/>{children}</body></html>;
}