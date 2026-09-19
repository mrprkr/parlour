import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Alegreya, Alegreya_Sans, Alegreya_Sans_SC } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

// The book's three voices: the serif for the plate titles and the prose, the
// sans for the key, the labels and the tables, and its small caps for the
// running heads and the room names.
const alegreya = Alegreya({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-serif",
});

const alegreyaSans = Alegreya_Sans({
  weight: ["400", "500", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const alegreyaSansSc = Alegreya_Sans_SC({
  weight: ["500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-caps",
});

const description =
  "Parlour is a voice assistant for your home that runs on a Mac you already own. A local wake word, local speech to text, a local model with tools, and a cloud model only when it is needed. Open source, MIT.";

export const metadata: Metadata = {
  metadataBase: new URL("https://heyparlour.app"),
  title: { default: "Parlour", template: "%s - Parlour" },
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
    { media: "(prefers-color-scheme: light)", color: "#fcfcfa" },
    { media: "(prefers-color-scheme: dark)", color: "#181716" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={`${alegreya.variable} ${alegreyaSans.variable} ${alegreyaSansSc.variable}`}>
      <body>
        <header className="running-head">
          <Link className="wordmark" href="/">
            <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M6 15 16 6l10 9M8 14v12h16V14M8 20h16" />
              <circle className="mark-dot" cx="13" cy="24" r="2.2" />
            </svg>
            Parlour
          </Link>
          <nav aria-label="Site">
            <Link href="/docs">Docs</Link>
            <a href="https://github.com/mrprkr/parlour">GitHub</a>
          </nav>
        </header>

        {children}

        <footer className="folio">
          <p>
            Parlour is released under the MIT licence. <a href="https://github.com/mrprkr/parlour">Source</a>,{" "}
            <a href="https://github.com/mrprkr/parlour/issues">issues</a>,{" "}
            <a href="https://www.npmjs.com/package/parlour">npm</a>.
          </p>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
