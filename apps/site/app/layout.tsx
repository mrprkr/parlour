import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Young_Serif } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const youngSerif = Young_Serif({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-young-serif",
});

const description =
  "Parlour is a voice assistant for your home that runs on a Mac you already own. A local wake word, local speech to text, a local model with tools, and a cloud model only when it is needed. Open source, MIT.";

export const metadata: Metadata = {
  title: "Parlour",
  description,
  openGraph: {
    title: "Parlour",
    description: "A voice assistant for your home, on a Mac you already own.",
    type: "website",
    url: "https://heyparlour.app/",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef0ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1f1b" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={youngSerif.variable}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
