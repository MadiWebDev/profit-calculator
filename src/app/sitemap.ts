import type { MetadataRoute } from "next";
import { calculators } from "@/config/calculators";
import { BASE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL,                                    lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${BASE_URL}/pricing`,                       lastModified: now, changeFrequency: "weekly",  priority: 0.95 },
    { url: `${BASE_URL}/features`,                      lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/compare/getprofitcalc`,         lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/calculators`,                   lastModified: now, changeFrequency: "weekly",  priority: 0.85 },
    { url: `${BASE_URL}/blog`,                          lastModified: now, changeFrequency: "weekly",  priority: 0.8 },
    { url: `${BASE_URL}/about`,                         lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE_URL}/contact`,                       lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/privacy-policy`,                lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE_URL}/terms-of-service`,              lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
  ];

  const calculatorPages: MetadataRoute.Sitemap = calculators.map((c) => ({
    url: `${BASE_URL}/calculators/${c.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.85,
  }));

  const blogPosts = [
    "how-to-price-products-for-30-percent-margin",
    "shopify-profit-margin-guide",
    "facebook-ads-roas-guide",
    "amazon-fba-profit-margins-explained",
    "dropshipping-profit-calculator-guide",
    "freelance-pricing-guide",
    "google-ads-roi-vs-roas",
    "ecommerce-break-even-analysis",
  ];

  const blogPages: MetadataRoute.Sitemap = blogPosts.map((slug) => ({
    url: `${BASE_URL}/blog/${slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticPages, ...calculatorPages, ...blogPages];
}
