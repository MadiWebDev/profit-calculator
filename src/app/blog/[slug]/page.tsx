"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BlogPostClient from "./BlogPostClient";
import { Skeleton } from "@/components/ui/skeleton";

export default function BlogPostPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [blog, setBlog] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchBlog();
  }, [slug]);

  const fetchBlog = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/blogs/${slug}`);
      
      if (!res.ok) {
        setError(true);
        return;
      }

      const data = await res.json();
      setBlog(data.blog);
    } catch (err) {
      console.error("Error fetching blog:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

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
        <div className="text-center">
          <h1 className="text-4xl font-bold text-[var(--color-foreground)] mb-4">
            404
          </h1>
          <p className="text-[var(--color-muted-foreground)] mb-4">
            Blog post not found
          </p>
          <a
            href="/blog"
            className="text-[var(--color-primary)] hover:underline"
          >
            Back to Blog
          </a>
        </div>
      </div>
    );
  }

  return <BlogPostClient blog={blog} />;
}
