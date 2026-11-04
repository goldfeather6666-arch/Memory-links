import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MNEMOSYNE — Personal AI Memory Engine",
  description:
    "MNEMOSYNE is a personal AI memory engine that gives every agent a persistent, structured, privacy-respecting memory of your world.",
  openGraph: {
    title: "MNEMOSYNE — Personal AI Memory Engine",
    description:
      "A personal AI memory engine that remembers the context that matters, across your digital universe.",
    type: "website",
    siteName: "MNEMOSYNE",
  },
  twitter: {
    card: "summary_large_image",
    title: "MNEMOSYNE — Personal AI Memory Engine",
    description:
      "A personal AI memory engine that remembers the context that matters, across your digital universe.",
  },
};

export const viewport: Viewport = {
  themeColor: "#08090d",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
