import { buildMetadata } from "@/lib/seo";
import SeoLandingPage from "@/components/seo/SeoLandingPage";
import { SEO_PAGES } from "@/lib/seo-pages";

const page = SEO_PAGES["use-cases"];

export const metadata = buildMetadata({
  title: page.title,
  description: page.description,
  path: "/use-cases",
});

export default function Page() {
  return <SeoLandingPage page={page} path="/use-cases" />;
}
