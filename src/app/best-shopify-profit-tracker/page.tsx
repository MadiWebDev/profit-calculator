import { buildMetadata } from "@/lib/seo";
import SeoLandingPage from "@/components/seo/SeoLandingPage";
import { SEO_PAGES } from "@/lib/seo-pages";

const page = SEO_PAGES["best-shopify-profit-tracker"];

export const metadata = buildMetadata({
  title: page.title,
  description: page.description,
  path: "/best-shopify-profit-tracker",
});

export default function Page() {
  return <SeoLandingPage page={page} path="/best-shopify-profit-tracker" />;
}
