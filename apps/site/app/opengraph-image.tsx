import { ImageResponse } from "next/og";
import { siteName, tagline } from "@/lib/site";

// The card a link to the site unfurls into: the mark, the name and the line
// under it, in the light scheme's paper, ink and hearth from the tokens.
export const alt = `${siteName}: ${tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 96px",
        background: "#eef0ea",
        color: "#14312b",
        fontFamily: "Georgia, serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <svg width="120" height="120" viewBox="0 0 32 32" aria-hidden="true">
          <path
            d="M6 15 16 6l10 9M8 13.2V26h16V13.2M8 20h16"
            fill="none"
            stroke="#14312b"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx="16" cy="14.5" r="2.4" fill="#1c6b52" />
        </svg>
        <div style={{ fontSize: 112 }}>{siteName}</div>
      </div>
      <div style={{ marginTop: 40, fontSize: 56, color: "#1c6b52" }}>{tagline}</div>
      <div style={{ marginTop: 24, fontSize: 34, color: "#5f6f5e" }}>
        A voice assistant for Home Assistant that runs on your Mac.
      </div>
    </div>,
    size,
  );
}
