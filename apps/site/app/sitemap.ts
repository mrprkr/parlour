import type { MetadataRoute } from "next";
import { absolute, pages } from "@/lib/site";
import { source } from "@/lib/source";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...pages.map((page) => ({ url: absolute(page.path), priority: page.path === "/" ? 1 : 0.6 })),
    ...source.getPages().map((page) => ({ url: absolute(page.url), priority: 0.8 })),
  ];
}
