import { buildMetadata } from "@/lib/seo";
import SeoLandingPage from "@/components/seo/SeoLandingPage";
import { SEO_PAGES } from "@/lib/seo-pages";

const page = SEO_PAGES["cod-profit-tracking-shopify"];

export const metadata = buildMetadata({
  title: page.title,
  description: page.description,
  path: "/cod-profit-tracking-shopify",
});

export default function Page() {
  return <SeoLandingPage page={page} path="/cod-profit-tracking-shopify" />;
}
