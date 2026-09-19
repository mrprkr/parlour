import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Alegreya, Alegreya_Sans, Alegreya_Sans_SC } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

// Three voices from one superfamily: the serif sets the headings, the sans
// sets everything that is read or consulted, and its small caps set the
// running head, the table columns and the labels on the drawing.
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
  "Parlour is a voice assistant for your home that runs on a Mac you already own. The wake word, the transcription, the model and the voice all stay on your machine, and the cloud is asked only when the local model cannot answer. Open source, MIT.";

export const metadata: Metadata = {
  metadataBase: new URL("https://heyparlour.app"),
  title: { default: "Parlour", template: "%s - Parlour" },
  description,
  openGraph: {
    title: "Parlour",
    description: "Ask your house. Nothing you say leaves it.",
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
