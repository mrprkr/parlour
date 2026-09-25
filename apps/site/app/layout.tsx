import { Analytics } from "@vercel/analytics/next";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata, Viewport } from "next";
import { Alegreya, Geist } from "next/font/google";
import type { ReactNode } from "react";
import { description, siteName, siteUrl, tagline } from "@/lib/site";
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

// The defaults. Every page adds its own canonical address and card through
// pageMetadata in lib/site.ts.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${siteName}: a private voice assistant for your home`, template: `%s - ${siteName}` },
  description,
  applicationName: siteName,
  openGraph: {
    title: siteName,
    description: tagline,
    type: "website",
    siteName,
    locale: "en_GB",
    url: "/",
  },
  twitter: { card: "summary_large_image", title: siteName, description: tagline },
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
