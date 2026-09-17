"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  MoreVertical,
  FileText,
  CheckCircle2,
  Archive,
  Calendar,
  Clock,
  Tag,
  Folder,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Blog {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  featuredImage?: string;
  status: "draft" | "published" | "archived";
  categories: string[];
  tags: string[];
  views: number;
  readTime: number;
  authorName: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function BlogsClient() {
  const router = useRouter();
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [blogToDelete, setBlogToDelete] = useState<Blog | null>(null);

  useEffect(() => {
    fetchBlogs();
  }, [pagination.page, statusFilter, sortBy, sortOrder]);

  const fetchBlogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sortBy,
        sortOrder,
      });

      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      if (searchQuery) {
        params.set("search", searchQuery);
      }

      const res = await fetch(`/api/admin/blogs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch blogs");

      const data = await res.json();
      setBlogs(data.blogs);
      setPagination(data.pagination);
    } catch (error) {
      console.error("Error fetching blogs:", error);
      toast.error("Failed to fetch blogs");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
    fetchBlogs();
  };

  const handleDelete = async () => {
    if (!blogToDelete) return;

    try {
      const res = await fetch(`/api/admin/blogs/${blogToDelete._id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete blog");

      toast.success("Blog deleted successfully");
      fetchBlogs();
    } catch (error) {
      console.error("Error deleting blog:", error);
      toast.error("Failed to delete blog");
    } finally {
      setDeleteDialogOpen(false);
      setBlogToDelete(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any; label: string }> = {
      draft: {
        variant: "secondary",
        icon: FileText,
        label: "Draft",
      },
      published: {
        variant: "default",
        icon: CheckCircle2,
        label: "Published",
      },
      archived: {
        variant: "outline",
        icon: Archive,
        label: "Archived",
      },
    };

    const config = variants[status] || variants.draft;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-foreground)]">
            Blog Management
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mt-1">
            Create and manage blog posts
          </p>
        </div>
        <Link href="/admin/blogs/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Blog Post
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[var(--color-muted-foreground)] text-sm mb-1">
            <FileText className="h-4 w-4" />
            Total Posts
          </div>
          <div className="text-2xl font-bold text-[var(--color-foreground)]">
            {pagination.total}
          </div>
        </div>
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[var(--color-muted-foreground)] text-sm mb-1">
            <CheckCircle2 className="h-4 w-4" />
            Published
          </div>
          <div className="text-2xl font-bold text-green-600">
            {blogs.filter((b) => b.status === "published").length}
          </div>
        </div>
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[var(--color-muted-foreground)] text-sm mb-1">
            <FileText className="h-4 w-4" />
            Drafts
          </div>
          <div className="text-2xl font-bold text-yellow-600">
            {blogs.filter((b) => b.status === "draft").length}
          </div>
        </div>
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
          <div className="flex items-center gap-2 text-[var(--color-muted-foreground)] text-sm mb-1">
            <Eye className="h-4 w-4" />
            Total Views
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {blogs.reduce((sum, b) => sum + b.views, 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-4">
        <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-muted-foreground)]" />
            <Input
              placeholder="Search blogs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt">Created Date</SelectItem>
              <SelectItem value="publishedAt">Published Date</SelectItem>
              <SelectItem value="updatedAt">Updated Date</SelectItem>
              <SelectItem value="views">Views</SelectItem>
              <SelectItem value="title">Title</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sortOrder}
            onValueChange={(v) => setSortOrder(v as "asc" | "desc")}
          >
            <SelectTrigger className="w-full md:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Desc</SelectItem>
              <SelectItem value="asc">Asc</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit">
            <Filter className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {/* Blogs List */}
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[var(--color-muted-foreground)]">
            Loading...
          </div>
        ) : blogs.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-[var(--color-muted-foreground)] mb-4" />
            <h3 className="text-lg font-semibold text-[var(--color-foreground)] mb-2">
              No blogs found
            </h3>
            <p className="text-[var(--color-muted-foreground)] mb-4">
              Get started by creating your first blog post
            </p>
            <Link href="/admin/blogs/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Blog Post
              </Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {blogs.map((blog) => (
              <div
                key={blog._id}
                className="p-4 hover:bg-[var(--color-muted)] transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* Featured Image */}
                  {blog.featuredImage ? (
                    <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-[var(--color-muted)]">
                      <img
                        src={blog.featuredImage}
                        alt={blog.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-24 h-24 flex-shrink-0 rounded-lg bg-[var(--color-muted)] flex items-center justify-center">
                      <FileText className="h-8 w-8 text-[var(--color-muted-foreground)]" />
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-[var(--color-foreground)] mb-1 truncate">
                          {blog.title}
                        </h3>
                        <p className="text-sm text-[var(--color-muted-foreground)] line-clamp-2">
                          {blog.excerpt}
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => router.push(`/blog/${blog.slug}`)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(`/admin/blogs/${blog._id}`)
                            }
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              setBlogToDelete(blog);
                              setDeleteDialogOpen(true);
                            }}
                            className="text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--color-muted-foreground)] mb-3">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {blog.publishedAt
                          ? formatDate(blog.publishedAt)
                          : formatDate(blog.createdAt)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {blog.readTime} min read
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {blog.views.toLocaleString()} views
                      </div>
                      <div className="text-xs">
                        by {blog.authorName}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {getStatusBadge(blog.status)}

                      {blog.categories.slice(0, 2).map((cat) => (
                        <Badge key={cat} variant="outline" className="gap-1">
                          <Folder className="h-3 w-3" />
                          {cat}
                        </Badge>
                      ))}

                      {blog.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="secondary" className="gap-1">
                          <Tag className="h-3 w-3" />
                          {tag}
                        </Badge>
                      ))}

                      {(blog.categories.length > 2 || blog.tags.length > 2) && (
                        <Badge variant="outline">
                          +{blog.categories.length + blog.tags.length - 4} more
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-[var(--color-muted-foreground)]">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
            {pagination.total} blogs
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
              }
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
                  (page >= pagination.page - 1 && page <= pagination.page + 1)
                ) {
                  return (
                    <Button
                      key={page}
                      variant={page === pagination.page ? "default" : "outline"}
                      size="sm"
                      onClick={() =>
                        setPagination((prev) => ({ ...prev, page }))
                      }
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
              size="sm"
              onClick={() =>
                setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
              }
              disabled={pagination.page === pagination.pages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the blog post &quot;{blogToDelete?.title}
              &quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
