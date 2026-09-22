import { Analytics } from "@vercel/analytics/next";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata, Viewport } from "next";
import { Alegreya, Geist } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Two faces. Alegreya gives the headings their character; Geist does
// everything that is read, consulted or clicked.
const alegreya = Alegreya({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-serif",
});

const geist = Geist({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const description =
  "Parlour is a voice assistant for Home Assistant that runs on a Mac you already own. Talk to it from any room. The wake word, the transcription, the model and the voice all stay on that machine. Open source, MIT.";

export const metadata: Metadata = {
  metadataBase: new URL("https://heyparlour.app"),
  title: { default: "Parlour", template: "%s - Parlour" },
  description,
  openGraph: {
    title: "Parlour",
    description: "Give Home Assistant a voice, and ask it anything else.",
    type: "website",
    url: "https://heyparlour.app/",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f3ef" },
    { media: "(prefers-color-scheme: dark)", color: "#111110" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={`${alegreya.variable} ${geist.variable}`} suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
        <Analytics />
      </body>
    </html>
  );
}
