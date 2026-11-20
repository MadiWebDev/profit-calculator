import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getPublishedBlogForSeo, trimMetaDescription } from "@/lib/blog-seo";
import BlogPostPageClient from "./BlogPostPageClient";

/**
 * /blog/[slug] — server shell around the client post renderer.
 *
 * Phase 2D: the post's title, description and canonical now come from
 * the server (generateMetadata), and a slug with no published post
 * returns a real 404 (notFound renders src/app/not-found.tsx with a
 * 404 status). Before this, the page was a client component that
 * fetched in useEffect: the SSR HTML had no title, no description, no
 * canonical and no H1, and /blog/<bad slug> returned 200 with a fake
 * "404" drawn in the browser. The article body itself still loads
 * client-side — its move to SSR is Phase 3.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const blog = await getPublishedBlogForSeo(slug);
  if (!blog) notFound();
  return buildMetadata({
    title: blog.title,
    description: trimMetaDescription(blog.excerpt),
    path: `/blog/${slug}`,
    image: blog.featuredImage,
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const blog = await getPublishedBlogForSeo(slug);
  if (!blog) notFound();
  return <BlogPostPageClient slug={slug} />;
}
