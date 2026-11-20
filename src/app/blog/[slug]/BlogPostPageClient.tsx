"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BlogPostClient, { BlogPost } from "./BlogPostClient";
import { Skeleton } from "@/components/ui/skeleton";
import { logger } from "@/lib/logger";

/**
 * The client half of /blog/[slug]. The server page already verified
 * the slug exists (and 404s when it doesn't), so this only fetches
 * the post body. A fetch failure here is a network/API error, not a
 * missing post — the error state says so.
 */
export default function BlogPostPageClient({ slug }: { slug: string }) {
  const [blog, setBlog] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchBlog = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/blogs/${slug}`);

        if (cancelled) return;
        if (!res.ok) {
          setError(true);
          return;
        }

        const data = await res.json();
        if (!cancelled) setBlog(data.blog as BlogPost);
      } catch (err) {
        logger.error("Error fetching blog", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchBlog();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)]">
        <div className="bg-[var(--color-card)] border-b border-[var(--color-border)]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (error || !blog) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <div className="text-center px-4">
          <h1 className="text-2xl font-bold text-[var(--color-foreground)] mb-4">
            Couldn&apos;t load this post
          </h1>
          <p className="text-[var(--color-muted-foreground)] mb-4">
            Something went wrong while loading the article. Please try
            again, or head back to the blog.
          </p>
          <Link
            href="/blog"
            className="text-[var(--color-primary)] hover:underline"
          >
            Back to Blog
          </Link>
        </div>
      </div>
    );
  }

  return <BlogPostClient blog={blog} />;
}
