import type { MetadataRoute } from "next";
import { BASE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // Allow the root plus the OG image endpoint. Every page's
        // og:image is /api/og?title=... and Googlebot discovers those
        // URLs from the meta tags — with only Disallow: /api/ they were
        // all blocked (GSC: Blocked by robots.txt, 5). Google applies
        // the longest matching rule, so /api/og wins over /api/ here
        // while every other /api/* route stays blocked.
        allow: ["/", "/api/og"],
        disallow: ["/api/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
