import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "PlantTrack | JT Utilities LTD", description: "Plant, inspections, LOLER and workshop maintenance management.", icons: { icon: "/favicon.ico", shortcut: "/favicon.ico", apple: "/favicon.ico" } };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en-GB"><head><link rel="icon" href="/favicon.ico?v=2" sizes="any" /></head><body>{children}</body></html>; }