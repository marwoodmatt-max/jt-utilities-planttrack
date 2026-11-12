import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "PlantTrack | JT Utilities LTD",
  description: "Plant, inspections, LOLER and workshop maintenance management.",
  icons: { icon: "/icon.png", shortcut: "/icon.png", apple: "/icon.png" }
};
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en-GB"><body>{children}</body></html>;
}