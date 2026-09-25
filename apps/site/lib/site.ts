import type { Metadata } from "next";

// The facts about the site and the project that more than one page states:
// the metadata, the structured data, llms.txt and the agent documents all
// read them from here so they cannot drift apart.

export const siteUrl = "https://heyparlour.app";
export const siteName = "Parlour";
export const tagline = "A voice for your home. Private by design.";
export const description =
  "Parlour turns the Mac you already own into a private voice assistant for Home Assistant. Talk to it from any room. The wake word, the transcription, the model and the voice all stay on your Mac. Free and open source.";

export const githubUrl = "https://github.com/mrprkr/parlour";
export const issuesUrl = `${githubUrl}/issues`;
export const newIssueUrl = `${githubUrl}/issues/new`;
export const securityReportUrl = `${githubUrl}/security/advisories/new`;
export const releasesUrl = `${githubUrl}/releases`;
export const npmUrl = "https://www.npmjs.com/package/parlour";
// The newest release's dmg. desktop-release.yml uploads it under this fixed name so the link never moves.
export const downloadUrl = `${githubUrl}/releases/latest/download/Parlour-Server-arm64.dmg`;

/** Every page with its own address, for the sitemap and the footer. */
export const pages = [
  { path: "/", title: "Parlour" },
  { path: "/pricing", title: "Pricing" },
  { path: "/help", title: "Help" },
  { path: "/contact", title: "Contact" },
  { path: "/privacy", title: "Privacy policy" },
] as const;

export function absolute(path: string): string {
  return new URL(path, siteUrl).toString();
}

// The card from app/opengraph-image.tsx. Named here because a page that sets
// its own openGraph would otherwise go out without it.
const card = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: `${siteName}: ${tagline}`,
};

/**
 * A page's metadata: its canonical address, the one language it comes in,
 * its markdown twin if it has one, and a link card that points at it rather
 * than at the front page.
 */
export function pageMetadata(page: {
  path: string;
  title?: string;
  description?: string;
  markdown?: boolean;
}): Metadata {
  const markdown = page.markdown === false ? undefined : page.path === "/" ? "/index.md" : `${page.path}.md`;
  return {
    ...(page.title ? { title: page.title } : {}),
    ...(page.description ? { description: page.description } : {}),
    alternates: {
      canonical: page.path,
      languages: { "en-GB": page.path, "x-default": page.path },
      ...(markdown ? { types: { "text/markdown": markdown } } : {}),
    },
    openGraph: {
      type: "website",
      siteName,
      locale: "en_GB",
      url: page.path,
      title: page.title ?? siteName,
      description: page.description ?? tagline,
      images: [card],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title ?? siteName,
      description: page.description ?? tagline,
      images: [card],
    },
  };
}

type Thing = Record<string, unknown>;

export const organisation: Thing = {
  "@type": "Organization",
  "@id": `${siteUrl}/#organization`,
  name: siteName,
  url: siteUrl,
  logo: absolute("/apple-icon.png"),
  description: "The open source project behind Parlour, a local-first voice assistant for the house.",
  sameAs: [githubUrl, npmUrl],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    url: absolute("/contact"),
    availableLanguage: "en",
  },
};

export const website: Thing = {
  "@type": "WebSite",
  "@id": `${siteUrl}/#website`,
  name: siteName,
  url: siteUrl,
  inLanguage: "en-GB",
  publisher: { "@id": `${siteUrl}/#organization` },
};

// Parlour is free; the offer says so in the one shape every agent reads.
const free: Thing = {
  "@type": "Offer",
  price: "0",
  priceCurrency: "USD",
  availability: "https://schema.org/InStock",
  url: absolute("/pricing"),
};

export const application: Thing = {
  "@type": "SoftwareApplication",
  "@id": `${siteUrl}/#software`,
  name: siteName,
  url: siteUrl,
  description,
  applicationCategory: "UtilitiesApplication",
  applicationSubCategory: "Voice assistant",
  operatingSystem: "macOS (Apple silicon)",
  softwareRequirements: "Node.js 22 or later and Homebrew; Home Assistant to control the house",
  license: "https://opensource.org/license/mit",
  isAccessibleForFree: true,
  downloadUrl,
  installUrl: npmUrl,
  codeRepository: githubUrl,
  offers: free,
  publisher: { "@id": `${siteUrl}/#organization` },
};

/** A BreadcrumbList from the trail of pages above this one, home first. */
export function breadcrumbs(trail: { name: string; path: string }[]): Thing {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [{ name: siteName, path: "/" }, ...trail].map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absolute(crumb.path),
    })),
  };
}

/** One JSON-LD document from several things, so each page carries a single graph. */
export function graph(...things: Thing[]): Thing {
  return { "@context": "https://schema.org", "@graph": things };
}
