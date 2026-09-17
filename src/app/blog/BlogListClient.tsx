"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Calendar,
  Clock,
  Eye,
  Tag,
  Folder,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Blog {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  featuredImage?: string;
  featuredImageAlt?: string;
  categories: string[];
  tags: string[];
  views: number;
  readTime: number;
  authorName: string;
  publishedAt: string;
}

interface Category {
  name: string;
  count: number;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function BlogListClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(
    searchParams.get("search") || ""
  );
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: parseInt(searchParams.get("page") || "1"),
    limit: 12,
    total: 0,
    pages: 0,
  });

  const selectedCategory = searchParams.get("category");
  const selectedTag = searchParams.get("tag");

  useEffect(() => {
    fetchBlogs();
    fetchCategories();
  }, [searchParams]);

  const fetchBlogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: searchParams.get("page") || "1",
        limit: "12",
      });

      if (searchParams.get("search")) {
        params.set("search", searchParams.get("search")!);
      }
      if (searchParams.get("category")) {
        params.set("category", searchParams.get("category")!);
      }
      if (searchParams.get("tag")) {
        params.set("tag", searchParams.get("tag")!);
      }

      const res = await fetch(`/api/blogs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch blogs");

      const data = await res.json();
      setBlogs(data.blogs);
      setPagination(data.pagination);
    } catch (error) {
      console.error("Error fetching blogs:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch("/api/blogs/categories");
      if (!res.ok) throw new Error("Failed to fetch categories");
      const data = await res.json();
      setCategories(data.categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (searchQuery) {
      params.set("search", searchQuery);
    } else {
      params.delete("search");
    }
    params.set("page", "1");
    router.push(`/blog?${params.toString()}`);
  };

  const handleCategoryClick = (category: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (selectedCategory === category) {
      params.delete("category");
    } else {
      params.set("category", category);
    }
    params.set("page", "1");
    router.push(`/blog?${params.toString()}`);
  };

  const handleTagClick = (tag: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (selectedTag === tag) {
      params.delete("tag");
    } else {
      params.set("tag", tag);
    }
    params.set("page", "1");
    router.push(`/blog?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push("/blog");
    setSearchQuery("");
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const hasActiveFilters = selectedCategory || selectedTag || searchParams.get("search");

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 border-b border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[var(--color-foreground)] mb-6">
              E-commerce Insights & Tips
            </h1>
            <p className="text-xl text-[var(--color-muted-foreground)] mb-8">
              Expert strategies to optimize your profit, manage ad spend, and grow
              your online business
            </p>

            {/* Search Bar */}
            <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--color-muted-foreground)]" />
                <Input
                  type="text"
                  placeholder="Search articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 pr-24 h-14 text-lg"
                />
                <Button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  Search
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="lg:w-64 flex-shrink-0">
            <div className="sticky top-8 space-y-6">
              {/* Categories */}
              {categories.length > 0 && (
                <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6">
                  <h3 className="font-semibold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
                    <Folder className="h-4 w-4" />
                    Categories
                  </h3>
                  <div className="space-y-2">
                    {categories.map((cat) => (
                      <button
                        key={cat.name}
                        onClick={() => handleCategoryClick(cat.name)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between",
                          selectedCategory === cat.name
                            ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium"
                            : "hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"
                        )}
                      >
                        <span className="capitalize">{cat.name}</span>
                        <span className="text-xs">{cat.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Popular Tags */}
              <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6">
                <h3 className="font-semibold text-[var(--color-foreground)] mb-4 flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Popular Topics
                </h3>
                <div className="flex flex-wrap gap-2">
                  {["profit", "ads", "shopify", "growth", "analytics", "tips"].map(
                    (tag) => (
                      <Badge
                        key={tag}
                        variant={selectedTag === tag ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => handleTagClick(tag)}
                      >
                        {tag}
                      </Badge>
                    )
                  )}
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1">
            {/* Active Filters */}
            {hasActiveFilters && (
              <div className="mb-6 flex items-center gap-2 flex-wrap">
                <span className="text-sm text-[var(--color-muted-foreground)]">
                  Active filters:
                </span>
                {selectedCategory && (
                  <Badge variant="secondary" className="gap-1">
                    <Folder className="h-3 w-3" />
                    {selectedCategory}
                    <button
                      onClick={() => handleCategoryClick(selectedCategory)}
                      className="ml-1 hover:text-red-600"
                    >
                      ×
                    </button>
                  </Badge>
                )}
                {selectedTag && (
                  <Badge variant="secondary" className="gap-1">
                    <Tag className="h-3 w-3" />
                    {selectedTag}
                    <button
                      onClick={() => handleTagClick(selectedTag)}
                      className="ml-1 hover:text-red-600"
                    >
                      ×
                    </button>
                  </Badge>
                )}
                {searchParams.get("search") && (
                  <Badge variant="secondary" className="gap-1">
                    <Search className="h-3 w-3" />
                    {searchParams.get("search")}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-xs"
                >
                  Clear all
                </Button>
              </div>
            )}

            {/* Results Count */}
            <div className="mb-6 text-sm text-[var(--color-muted-foreground)]">
              {loading ? (
                "Loading..."
              ) : (
                <>
                  Showing {blogs.length} of {pagination.total} articles
                </>
              )}
            </div>

            {/* Blog Grid */}
            {loading ? (
              <div className="text-center py-12 text-[var(--color-muted-foreground)]">
                Loading articles...
              </div>
            ) : blogs.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-muted)] mb-4">
                  <Search className="h-8 w-8 text-[var(--color-muted-foreground)]" />
                </div>
                <h3 className="text-xl font-semibold text-[var(--color-foreground)] mb-2">
                  No articles found
                </h3>
                <p className="text-[var(--color-muted-foreground)] mb-4">
                  Try adjusting your search or filters
                </p>
                {hasActiveFilters && (
                  <Button onClick={clearFilters}>Clear filters</Button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {blogs.map((blog) => (
                    <article
                      key={blog._id}
                      className="group bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                    >
                      <Link href={`/blog/${blog.slug}`}>
                        {/* Featured Image */}
                        <div className="relative h-48 bg-[var(--color-muted)] overflow-hidden">
                          {blog.featuredImage ? (
                            <img
                              src={blog.featuredImage}
                              alt={blog.featuredImageAlt || blog.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <TrendingUp className="h-12 w-12 text-[var(--color-muted-foreground)]" />
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="p-6">
                          {/* Categories */}
                          {blog.categories.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                              {blog.categories.slice(0, 2).map((cat) => (
                                <Badge
                                  key={cat}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {cat}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {/* Title */}
                          <h2 className="text-xl font-bold text-[var(--color-foreground)] mb-3 line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {blog.title}
                          </h2>

                          {/* Excerpt */}
                          <p className="text-[var(--color-muted-foreground)] mb-4 line-clamp-3 text-sm">
                            {blog.excerpt}
                          </p>

                          {/* Meta */}
                          <div className="flex items-center gap-4 text-xs text-[var(--color-muted-foreground)] mb-4">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(blog.publishedAt)}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {blog.readTime} min
                            </div>
                            <div className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {blog.views}
                            </div>
                          </div>

                          {/* Read More */}
                          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-medium text-sm group-hover:gap-3 transition-all">
                            Read Article
                            <ArrowRight className="h-4 w-4" />
                          </div>
                        </div>
                      </Link>
                    </article>
                  ))}
                </div>

                {/* Pagination */}
                {pagination.pages > 1 && (
                  <div className="mt-12 flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const params = new URLSearchParams(
                          searchParams.toString()
                        );
                        params.set("page", String(pagination.page - 1));
                        router.push(`/blog?${params.toString()}`);
                      }}
                      disabled={pagination.page === 1}
                    >
                      Previous
                    </Button>

                    <div className="flex items-center gap-1">
                      {[...Array(pagination.pages)].map((_, i) => {
                        const page = i + 1;
                        if (
                          page === 1 ||
                          page === pagination.pages ||
                          (page >= pagination.page - 1 &&
                            page <= pagination.page + 1)
                        ) {
                          return (
                            <Button
                              key={page}
                              variant={
                                page === pagination.page ? "default" : "outline"
                              }
                              size="sm"
                              onClick={() => {
                                const params = new URLSearchParams(
                                  searchParams.toString()
                                );
                                params.set("page", String(page));
                                router.push(`/blog?${params.toString()}`);
                              }}
                            >
                              {page}
                            </Button>
                          );
                        } else if (
                          page === pagination.page - 2 ||
                          page === pagination.page + 2
                        ) {
                          return <span key={page}>...</span>;
                        }
                        return null;
                      })}
                    </div>

                    <Button
                      variant="outline"
                      onClick={() => {
                        const params = new URLSearchParams(
                          searchParams.toString()
                        );
                        params.set("page", String(pagination.page + 1));
                        router.push(`/blog?${params.toString()}`);
                      }}
                      disabled={pagination.page === pagination.pages}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
