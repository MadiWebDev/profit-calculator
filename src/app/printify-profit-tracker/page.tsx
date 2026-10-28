import { buildMetadata } from "@/lib/seo";
import SeoLandingPage from "@/components/seo/SeoLandingPage";
import { SEO_PAGES } from "@/lib/seo-pages";

const page = SEO_PAGES["printify-profit-tracker"];

export const metadata = buildMetadata({
  title: page.title,
  description: page.description,
  path: "/printify-profit-tracker",
});

export default function Page() {
  return <SeoLandingPage page={page} path="/printify-profit-tracker" />;
}
