import { buildMetadata } from "@/lib/seo";
import SeoLandingPage from "@/components/seo/SeoLandingPage";
import { SEO_PAGES } from "@/lib/seo-pages";

const page = SEO_PAGES["beprofit-alternative"];

export const metadata = buildMetadata({
  title: page.title,
  description: page.description,
  path: "/beprofit-alternative",
});

export default function Page() {
  return <SeoLandingPage page={page} path="/beprofit-alternative" />;
}
