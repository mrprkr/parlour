import type { Metadata, Viewport } from "next";
import { Young_Serif } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

const serif = Young_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--serif-face",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://heyparlour.app"),
  title: { default: "Parlour", template: "%s - Parlour" },
  description:
    "Parlour is a voice assistant for your home that runs on a Mac you already own. A local wake word, local speech to text, a local model with tools, and a cloud model only when it is needed. Open source, MIT.",
  openGraph: {
    title: "Parlour",
    description: "A voice assistant for your home, on a Mac you already own.",
    type: "website",
    url: "https://heyparlour.app/",
  },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef0ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1f1b" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={serif.variable}>
      <body>
        <header className="top">
          <Link className="wordmark" href="/">
            Parlour
          </Link>
          <nav>
            <Link href="/docs">Docs</Link>
            <a href="https://github.com/mrprkr/parlour">GitHub</a>
          </nav>
        </header>

        {children}

        <footer>
          <p>
            Parlour is released under the MIT licence. <a href="https://github.com/mrprkr/parlour">Source</a>,{" "}
            <a href="https://github.com/mrprkr/parlour/issues">issues</a>,{" "}
            <a href="https://www.npmjs.com/package/parlour">npm</a>.
          </p>
        </footer>
      </body>
    </html>
  );
}
