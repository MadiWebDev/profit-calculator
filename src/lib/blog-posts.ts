// The 8 published blog posts, as one shared list. The sitemap, the
// homepage "Latest from the blog" section and the calculators hub
// "Guides" section all link from this list, so a post can never be
// in the sitemap but unlinked from every page (or vice versa).
//
// Titles are the posts' real titles (they match the slugs); the
// posts themselves live in the database, so if a post is renamed or
// removed this list must be updated with it.
export const BLOG_POST_LINKS: { slug: string; title: string }[] = [
  { slug: "shopify-profit-margin-guide", title: "Shopify Profit Margin Guide" },
  { slug: "how-to-price-products-for-30-percent-margin", title: "How to Price Products for a 30% Margin" },
  { slug: "facebook-ads-roas-guide", title: "Facebook Ads ROAS Guide" },
  { slug: "amazon-fba-profit-margins-explained", title: "Amazon FBA Profit Margins Explained" },
  { slug: "dropshipping-profit-calculator-guide", title: "Dropshipping Profit Calculator Guide" },
  { slug: "freelance-pricing-guide", title: "Freelance Pricing Guide" },
  { slug: "google-ads-roi-vs-roas", title: "Google Ads ROI vs ROAS" },
  { slug: "ecommerce-break-even-analysis", title: "Ecommerce Break-Even Analysis" },
];
