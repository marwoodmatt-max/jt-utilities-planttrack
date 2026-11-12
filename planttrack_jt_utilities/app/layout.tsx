import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "PlantTrack | JT Utilities LTD",
  description: "Plant, inspections, LOLER and workshop maintenance management.",
  icons: { icon: [{ url: "/favicon.png", type: "image/png" }], shortcut: "/favicon.png", apple: "/favicon.png" }
};
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en-GB"><body>{children}</body></html>;
}