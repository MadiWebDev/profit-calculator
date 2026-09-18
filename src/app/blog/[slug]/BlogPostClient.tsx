"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Eye,
  Tag,
  Folder,
  ArrowLeft,
  Share2,

  Link2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SocialIcon } from "react-social-icons";

interface BlogPost {
  _id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  featuredImage?: string;
  featuredImageAlt?: string;
  author: {
    name: string;
    image?: string;
  };
  authorName: string;
  status: string;
  publishedAt: string;
  categories: string[];
  tags: string[];
  views: number;
  readTime: number;
  relatedPosts?: Array<{
    _id: string;
    title: string;
    slug: string;
    excerpt: string;
    featuredImage?: string;
    publishedAt: string;
    readTime: number;
  }>;
}

interface BlogPostClientProps {
  blog: BlogPost;
}

export default function BlogPostClient({ blog }: BlogPostClientProps) {
  useEffect(() => {
    // Add JSON-LD structured data for SEO
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: blog.title,
      image: blog.featuredImage,
      datePublished: blog.publishedAt,
      dateModified: blog.publishedAt,
      author: {
        "@type": "Person",
        name: blog.authorName,
      },
      publisher: {
        "@type": "Organization",
        name: "GetProfitCalc",
        logo: {
          "@type": "ImageObject",
          url: `${process.env.NEXT_PUBLIC_SITE_URL}/logo.png`,
        },
      },
      description: blog.excerpt,
      articleBody: blog.content,
      keywords: [...blog.categories, ...blog.tags].join(", "),
    });
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, [blog]);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareTitle = blog.title;

  const handleShare = async (platform?: string) => {
    const url = shareUrl;
    const text = shareTitle;

    if (platform === "twitter") {
      window.open(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(
          text
        )}&url=${encodeURIComponent(url)}`,
        "_blank"
      );
    } else if (platform === "facebook") {
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
        "_blank"
      );
    } else if (platform === "linkedin") {
      window.open(
        `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
          url
        )}`,
        "_blank"
      );
    } else {
      // Copy link
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard!");
      } catch (error) {
        toast.error("Failed to copy link");
      }
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* Back Button */}
      <div className="bg-[var(--color-card)] border-b border-[var(--color-border)]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Blog
          </Link>
        </div>
      </div>

      {/* Article */}
      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <header className="mb-8">
          {/* Categories */}
          {blog.categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {blog.categories.map((cat) => (
                <Link key={cat} href={`/blog?category=${cat}`}>
                  <Badge variant="secondary" className="gap-1 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 cursor-pointer">
                    <Folder className="h-3 w-3" />
                    {cat}
                  </Badge>
                </Link>
              ))}
            </div>
          )}

          {/* Title */}
          <h1 className="text-4xl sm:text-5xl font-bold text-[var(--color-foreground)] mb-6 leading-tight">
            {blog.title}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-6 text-sm text-[var(--color-muted-foreground)] mb-6">
            <div className="flex items-center gap-2">
              <Avatar className="h-10 w-10">
                <AvatarImage src={blog.author?.image} />
                <AvatarFallback>
                  <User className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-[var(--color-foreground)]">
                {blog.authorName}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(blog.publishedAt)}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {blog.readTime} min read
            </div>
            <div className="flex items-center gap-1">
              <Eye className="h-4 w-4" />
              {blog.views.toLocaleString()} views
            </div>
          </div>

          {/* Share Buttons */}
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <span className="text-sm font-medium text-[var(--color-muted-foreground)] mr-1">
              Share:
            </span>
            <button
              onClick={() => handleShare("twitter")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1DA1F2] hover:bg-[#1a8cd8] text-white transition-all hover:scale-105 text-sm font-medium shadow-sm"
              title="Share on Twitter"
            >
              <SocialIcon
                network="twitter"
                style={{ height: 20, width: 20 }}
                bgColor="transparent"
                fgColor="currentColor"
              />
              <span className="hidden sm:inline">Twitter</span>
            </button>
            <button
              onClick={() => handleShare("facebook")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1877F2] hover:bg-[#166fe5] text-white transition-all hover:scale-105 text-sm font-medium shadow-sm"
              title="Share on Facebook"
            >
              <SocialIcon
                network="facebook"
                style={{ height: 20, width: 20 }}
                bgColor="transparent"
                fgColor="currentColor"
              />
              <span className="hidden sm:inline">Facebook</span>
            </button>
            <button
              onClick={() => handleShare("linkedin")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0A66C2] hover:bg-[#095196] text-white transition-all hover:scale-105 text-sm font-medium shadow-sm"
              title="Share on LinkedIn"
            >
              <SocialIcon
                network="linkedin"
                style={{ height: 20, width: 20 }}
                bgColor="transparent"
                fgColor="currentColor"
              />
              <span className="hidden sm:inline">LinkedIn</span>
            </button>
            <button
              onClick={() => handleShare()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-muted)] hover:bg-[var(--color-accent)] text-[var(--color-foreground)] transition-all hover:scale-105 text-sm font-medium border border-[var(--color-border)] shadow-sm"
              title="Copy link"
            >
              <Link2 className="h-4 w-4" />
              <span className="hidden sm:inline">Copy Link</span>
            </button>
          </div>

          {/* Featured Image */}
          {blog.featuredImage && (
            <div className="relative w-full h-[400px] sm:h-[500px] rounded-xl overflow-hidden mb-8">
              <img
                src={blog.featuredImage}
                alt={blog.featuredImageAlt || blog.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </header>

        {/* Content */}
        <div
          className="prose prose-lg dark:prose-invert max-w-none mb-12"
          dangerouslySetInnerHTML={{ __html: blog.content }}
          style={{
            // Enhanced typography styles for blog content
            lineHeight: "1.8",
          }}
        />

        {/* Tags */}
        {blog.tags.length > 0 && (
          <div className="mb-12">
            <Separator className="mb-6" />
            <div className="flex flex-wrap items-center gap-2">
              <Tag className="h-4 w-4 text-[var(--color-muted-foreground)]" />
              <span className="text-sm text-[var(--color-muted-foreground)] mr-2">
                Tags:
              </span>
              {blog.tags.map((tag) => (
                <Link key={tag} href={`/blog?tag=${tag}`}>
                  <Badge
                    variant="outline"
                    className="cursor-pointer hover:bg-[var(--color-muted)]"
                  >
                    {tag}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Author Bio */}
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6 mb-12">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={blog.author?.image} />
              <AvatarFallback>
                <User className="h-8 w-8" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="font-semibold text-lg text-[var(--color-foreground)] mb-1">
                {blog.authorName}
              </h3>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Author and e-commerce expert sharing insights on profit
                optimization and business growth.
              </p>
            </div>
          </div>
        </div>

        {/* Related Posts */}
        {blog.relatedPosts && blog.relatedPosts.length > 0 && (
          <div>
            <Separator className="mb-8" />
            <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-6">
              Related Articles
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {blog.relatedPosts.slice(0, 4).map((post) => (
                <Link
                  key={post._id}
                  href={`/blog/${post.slug}`}
                  className="group bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                >
                  {post.featuredImage && (
                    <div className="relative h-40 bg-[var(--color-muted)] overflow-hidden">
                      <img
                        src={post.featuredImage}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="font-semibold text-[var(--color-foreground)] mb-2 line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {post.title}
                    </h3>
                    <p className="text-sm text-[var(--color-muted-foreground)] line-clamp-2 mb-3">
                      {post.excerpt}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-[var(--color-muted-foreground)]">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(post.publishedAt)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {post.readTime} min
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>

      {/* Sticky Share Bar (Mobile) */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-card)] border-t border-[var(--color-border)] p-4 md:hidden z-50 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-[var(--color-muted-foreground)]">
            Share article
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handleShare("twitter")}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-[#1DA1F2] text-white hover:bg-[#1a8cd8] transition-colors"
              title="Share on Twitter"
            >
              <SocialIcon
                network="twitter"
                style={{ height: 18, width: 18 }}
                bgColor="transparent"
                fgColor="currentColor"
              />
            </button>
            <button
              onClick={() => handleShare("facebook")}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-[#1877F2] text-white hover:bg-[#166fe5] transition-colors"
              title="Share on Facebook"
            >
              <SocialIcon
                network="facebook"
                style={{ height: 18, width: 18 }}
                bgColor="transparent"
                fgColor="currentColor"
              />
            </button>
            <button
              onClick={() => handleShare()}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-[var(--color-muted)] text-[var(--color-foreground)] hover:bg-[var(--color-accent)] border border-[var(--color-border)] transition-colors"
              title="Copy link"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
