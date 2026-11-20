import { cache } from "react";
import { connectDB } from "@/lib/db";
import Blog from "@/models/Blog";

export interface BlogSeoData {
  title: string;
  slug: string;
  excerpt: string;
  featuredImage?: string;
  publishedAt?: string;
}

/**
 * A published blog post, for generateMetadata and the 404 check on
 * /blog/[slug]. Cached per request (React `cache`), so generateMetadata
 * and the page component share one DB query.
 *
 * Server-only: importing this from a client component would pull
 * Mongoose into the browser bundle.
 */
export const getPublishedBlogForSeo = cache(
  async (slug: string): Promise<BlogSeoData | null> => {
    await connectDB();
    const blog = await Blog.findOne({ slug, status: "published" })
      .select("title slug excerpt featuredImage publishedAt")
      .lean();
    if (!blog) return null;
    return {
      title: blog.title,
      slug: blog.slug,
      excerpt: blog.excerpt ?? "",
      featuredImage: blog.featuredImage ?? undefined,
      publishedAt: blog.publishedAt
        ? new Date(blog.publishedAt).toISOString()
        : undefined,
    };
  },
);

/**
 * Trim a post excerpt to a meta-description length without cutting
 * mid-word. Falls back to the full text when it already fits.
 */
export function trimMetaDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : max - 1).trimEnd()}…`;
}
