import { buildMetadata } from "@/lib/seo";
import SeoLandingPage from "@/components/seo/SeoLandingPage";
import { SEO_PAGES } from "@/lib/seo-pages";

const page = SEO_PAGES["multi-currency-profit-tracking"];

export const metadata = buildMetadata({
  title: page.title,
  description: page.description,
  path: "/multi-currency-profit-tracking",
});

export default function Page() {
  return <SeoLandingPage page={page} path="/multi-currency-profit-tracking" />;
}
