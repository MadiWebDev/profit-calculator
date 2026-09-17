"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Eye,
  ArrowLeft,
  Upload,
  X,
  Globe,
  FileText,
  Tag,
  Folder,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import RichTextEditor from "@/components/ui/RichTextEditor";

interface BlogFormData {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  featuredImage: string;
  featuredImageAlt: string;
  status: "draft" | "published" | "archived";
  categories: string[];
  tags: string[];
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string[];
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterCard: "summary" | "summary_large_image" | "app" | "player";
  canonicalUrl: string;
}

interface BlogEditorClientProps {
  blogId?: string;
}

export default function BlogEditorClient({ blogId }: BlogEditorClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(!!blogId);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState<BlogFormData>({
    title: "",
    slug: "",
    content: "",
    excerpt: "",
    featuredImage: "",
    featuredImageAlt: "",
    status: "draft",
    categories: [],
    tags: [],
    metaTitle: "",
    metaDescription: "",
    metaKeywords: [],
    ogTitle: "",
    ogDescription: "",
    ogImage: "",
    twitterCard: "summary_large_image",
    canonicalUrl: "",
  });

  const [categoryInput, setCategoryInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");

  useEffect(() => {
    if (blogId && blogId !== "new") {
      fetchBlog();
    }
  }, [blogId]);

  const fetchBlog = async () => {
    if (!blogId || blogId === "new") return;

    try {
      setLoading(true);
      const res = await fetch(`/api/admin/blogs/${blogId}`);
      if (!res.ok) throw new Error("Failed to fetch blog");

      const data = await res.json();
      setFormData({
        title: data.blog.title || "",
        slug: data.blog.slug || "",
        content: data.blog.content || "",
        excerpt: data.blog.excerpt || "",
        featuredImage: data.blog.featuredImage || "",
        featuredImageAlt: data.blog.featuredImageAlt || "",
        status: data.blog.status || "draft",
        categories: data.blog.categories || [],
        tags: data.blog.tags || [],
        metaTitle: data.blog.metaTitle || "",
        metaDescription: data.blog.metaDescription || "",
        metaKeywords: data.blog.metaKeywords || [],
        ogTitle: data.blog.ogTitle || "",
        ogDescription: data.blog.ogDescription || "",
        ogImage: data.blog.ogImage || "",
        twitterCard: data.blog.twitterCard || "summary_large_image",
        canonicalUrl: data.blog.canonicalUrl || "",
      });
    } catch (error) {
      console.error("Error fetching blog:", error);
      toast.error("Failed to fetch blog");
      router.push("/admin/blogs");
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "blog");

      const res = await fetch("/api/upload/cloudinary", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const data = await res.json();
      return data.url;
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Failed to upload image");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleFeaturedImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await handleImageUpload(file);
    if (url) {
      setFormData((prev) => ({ ...prev, featuredImage: url, ogImage: url }));
      toast.success("Featured image uploaded");
    }
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const handleTitleChange = (title: string) => {
    setFormData((prev) => ({
      ...prev,
      title,
      slug: prev.slug || generateSlug(title),
      metaTitle: prev.metaTitle || title,
      ogTitle: prev.ogTitle || title,
    }));
  };

  const handleExcerptChange = (excerpt: string) => {
    setFormData((prev) => ({
      ...prev,
      excerpt,
      metaDescription: prev.metaDescription || excerpt,
      ogDescription: prev.ogDescription || excerpt,
    }));
  };

  const addCategory = () => {
    if (!categoryInput.trim()) return;
    const category = categoryInput.toLowerCase().trim();
    if (!formData.categories.includes(category)) {
      setFormData((prev) => ({
        ...prev,
        categories: [...prev.categories, category],
      }));
    }
    setCategoryInput("");
  };

  const removeCategory = (category: string) => {
    setFormData((prev) => ({
      ...prev,
      categories: prev.categories.filter((c) => c !== category),
    }));
  };

  const addTag = () => {
    if (!tagInput.trim()) return;
    const tag = tagInput.toLowerCase().trim();
    if (!formData.tags.includes(tag)) {
      setFormData((prev) => ({
        ...prev,
        tags: [...prev.tags, tag],
      }));
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  };

  const addKeyword = () => {
    if (!keywordInput.trim()) return;
    const keyword = keywordInput.toLowerCase().trim();
    if (!formData.metaKeywords.includes(keyword)) {
      setFormData((prev) => ({
        ...prev,
        metaKeywords: [...prev.metaKeywords, keyword],
      }));
    }
    setKeywordInput("");
  };

  const removeKeyword = (keyword: string) => {
    setFormData((prev) => ({
      ...prev,
      metaKeywords: prev.metaKeywords.filter((k) => k !== keyword),
    }));
  };

  const handleSave = async (publish: boolean = false) => {
    // Validation
    if (!formData.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!formData.content.trim()) {
      toast.error("Content is required");
      return;
    }
    if (!formData.excerpt.trim()) {
      toast.error("Excerpt is required");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        ...formData,
        status: publish ? "published" : formData.status,
      };

      const url = blogId && blogId !== "new"
        ? `/api/admin/blogs/${blogId}`
        : "/api/admin/blogs";

      const method = blogId && blogId !== "new" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save blog");
      }

      const data = await res.json();
      toast.success(
        publish ? "Blog published successfully" : "Blog saved successfully"
      );

      if (!blogId || blogId === "new") {
        router.push(`/admin/blogs/${data.blog._id}`);
      } else {
        fetchBlog();
      }
    } catch (error: any) {
      console.error("Error saving blog:", error);
      toast.error(error.message || "Failed to save blog");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[var(--color-muted-foreground)]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/admin/blogs")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">
              {blogId && blogId !== "new" ? "Edit Blog Post" : "New Blog Post"}
            </h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              {formData.status === "published"
                ? "Published"
                : formData.status === "draft"
                ? "Draft"
                : "Archived"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {blogId && blogId !== "new" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/blog/${formData.slug}`, "_blank")}
            >
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSave(false)}
            disabled={saving}
          >
            <Save className="h-4 w-4 mr-2" />
            Save Draft
          </Button>
          <Button
            size="sm"
            onClick={() => handleSave(true)}
            disabled={saving}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {formData.status === "published" ? "Update" : "Publish"}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="content" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Content Tab */}
        <TabsContent value="content" className="space-y-6">
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6 space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                placeholder="Enter blog title..."
                value={formData.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="text-lg font-semibold"
              />
            </div>

            {/* Slug */}
            <div className="space-y-2">
              <Label htmlFor="slug">
                URL Slug <span className="text-red-500">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--color-muted-foreground)]">
                  /blog/
                </span>
                <Input
                  id="slug"
                  placeholder="url-slug"
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, slug: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Featured Image */}
            <div className="space-y-2">
              <Label>Featured Image</Label>
              {formData.featuredImage ? (
                <div className="relative group">
                  <img
                    src={formData.featuredImage}
                    alt="Featured"
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        featuredImage: "",
                        featuredImageAlt: "",
                      }))
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-[var(--color-border)] rounded-lg p-8 text-center">
                  <ImageIcon className="h-12 w-12 mx-auto text-[var(--color-muted-foreground)] mb-4" />
                  <Label
                    htmlFor="featured-image"
                    className="cursor-pointer inline-flex items-center gap-2 text-sm text-[var(--color-foreground)] hover:text-[var(--color-primary)]"
                  >
                    <Upload className="h-4 w-4" />
                    {uploading ? "Uploading..." : "Upload Featured Image"}
                  </Label>
                  <input
                    id="featured-image"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFeaturedImageUpload}
                    disabled={uploading}
                  />
                </div>
              )}
              {formData.featuredImage && (
                <Input
                  placeholder="Alt text for featured image"
                  value={formData.featuredImageAlt}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      featuredImageAlt: e.target.value,
                    }))
                  }
                />
              )}
            </div>

            {/* Excerpt */}
            <div className="space-y-2">
              <Label htmlFor="excerpt">
                Excerpt <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="excerpt"
                placeholder="Brief summary of your blog post (shown in listings)"
                value={formData.excerpt}
                onChange={(e) => handleExcerptChange(e.target.value)}
                rows={3}
                maxLength={500}
              />
              <div className="text-xs text-[var(--color-muted-foreground)] text-right">
                {formData.excerpt.length}/500
              </div>
            </div>

            {/* Content Editor */}
            <div className="space-y-2">
              <Label>
                Content <span className="text-red-500">*</span>
              </Label>
              <RichTextEditor
                content={formData.content}
                onChange={(content) =>
                  setFormData((prev) => ({ ...prev, content }))
                }
                placeholder="Write your blog post content..."
                onImageUpload={handleImageUpload}
              />
            </div>

            {/* Categories */}
            <div className="space-y-2">
              <Label htmlFor="category">Categories</Label>
              <div className="flex gap-2">
                <Input
                  id="category"
                  placeholder="Add category..."
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addCategory())}
                />
                <Button type="button" onClick={addCategory}>
                  <Folder className="h-4 w-4" />
                </Button>
              </div>
              {formData.categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.categories.map((cat) => (
                    <Badge key={cat} variant="outline" className="gap-1">
                      <Folder className="h-3 w-3" />
                      {cat}
                      <button
                        type="button"
                        onClick={() => removeCategory(cat)}
                        className="ml-1 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="tag">Tags</Label>
              <div className="flex gap-2">
                <Input
                  id="tag"
                  placeholder="Add tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                />
                <Button type="button" onClick={addTag}>
                  <Tag className="h-4 w-4" />
                </Button>
              </div>
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      <Tag className="h-3 w-3" />
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="ml-1 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* SEO Tab */}
        <TabsContent value="seo" className="space-y-6">
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6 space-y-6">
            <div className="flex items-center gap-2 text-[var(--color-muted-foreground)] mb-4">
              <Globe className="h-5 w-5" />
              <h3 className="font-semibold">Search Engine Optimization</h3>
            </div>

            {/* Meta Title */}
            <div className="space-y-2">
              <Label htmlFor="meta-title">Meta Title</Label>
              <Input
                id="meta-title"
                placeholder="SEO title (defaults to blog title)"
                value={formData.metaTitle}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, metaTitle: e.target.value }))
                }
                maxLength={60}
              />
              <div className="text-xs text-[var(--color-muted-foreground)] text-right">
                {formData.metaTitle.length}/60
              </div>
            </div>

            {/* Meta Description */}
            <div className="space-y-2">
              <Label htmlFor="meta-description">Meta Description</Label>
              <Textarea
                id="meta-description"
                placeholder="SEO description (defaults to excerpt)"
                value={formData.metaDescription}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    metaDescription: e.target.value,
                  }))
                }
                rows={3}
                maxLength={160}
              />
              <div className="text-xs text-[var(--color-muted-foreground)] text-right">
                {formData.metaDescription.length}/160
              </div>
            </div>

            {/* Meta Keywords */}
            <div className="space-y-2">
              <Label htmlFor="keyword">Meta Keywords</Label>
              <div className="flex gap-2">
                <Input
                  id="keyword"
                  placeholder="Add keyword..."
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                />
                <Button type="button" onClick={addKeyword}>
                  Add
                </Button>
              </div>
              {formData.metaKeywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.metaKeywords.map((keyword) => (
                    <Badge key={keyword} variant="outline">
                      {keyword}
                      <button
                        type="button"
                        onClick={() => removeKeyword(keyword)}
                        className="ml-1 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* OG Title */}
            <div className="space-y-2">
              <Label htmlFor="og-title">Open Graph Title</Label>
              <Input
                id="og-title"
                placeholder="Social media title (defaults to blog title)"
                value={formData.ogTitle}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, ogTitle: e.target.value }))
                }
                maxLength={60}
              />
            </div>

            {/* OG Description */}
            <div className="space-y-2">
              <Label htmlFor="og-description">Open Graph Description</Label>
              <Textarea
                id="og-description"
                placeholder="Social media description (defaults to excerpt)"
                value={formData.ogDescription}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    ogDescription: e.target.value,
                  }))
                }
                rows={2}
                maxLength={160}
              />
            </div>

            {/* OG Image */}
            <div className="space-y-2">
              <Label htmlFor="og-image">Open Graph Image URL</Label>
              <Input
                id="og-image"
                placeholder="Social media image (defaults to featured image)"
                value={formData.ogImage}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, ogImage: e.target.value }))
                }
              />
            </div>

            {/* Twitter Card */}
            <div className="space-y-2">
              <Label htmlFor="twitter-card">Twitter Card Type</Label>
              <Select
                value={formData.twitterCard}
                onValueChange={(v: any) =>
                  setFormData((prev) => ({ ...prev, twitterCard: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">Summary</SelectItem>
                  <SelectItem value="summary_large_image">
                    Summary Large Image
                  </SelectItem>
                  <SelectItem value="app">App</SelectItem>
                  <SelectItem value="player">Player</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Canonical URL */}
            <div className="space-y-2">
              <Label htmlFor="canonical">Canonical URL (Optional)</Label>
              <Input
                id="canonical"
                placeholder="https://example.com/original-post"
                value={formData.canonicalUrl}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    canonicalUrl: e.target.value,
                  }))
                }
              />
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Use if this content was originally published elsewhere
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg p-6 space-y-6">
            <div className="flex items-center gap-2 text-[var(--color-muted-foreground)] mb-4">
              <FileText className="h-5 w-5" />
              <h3 className="font-semibold">Publication Settings</h3>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v: any) =>
                  setFormData((prev) => ({ ...prev, status: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
