import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import Blog from "@/models/Blog";
import { parseQuery, fail } from "@/lib/validation";
import { logger, toLogError } from "@/lib/logger";

const BlogsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
    search: z.string().trim().max(200).optional(),
    category: z.string().trim().max(80).optional(),
    tag: z.string().trim().max(80).optional(),
    sortBy: z.enum(["publishedAt", "views", "title"]).default("publishedAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

// GET - Public blog listing (only published blogs)
export async function GET(req: NextRequest) {
  const rl = await withRateLimit(req, "lenient", "blogs-list");
  if (rl) return rl;

  const q = parseQuery(req, BlogsQuerySchema);
  if ("response" in q) return q.response;
  const { page, limit, search, category, tag, sortBy, sortOrder } = q.data;

  try {
    await connectDB();

    const skip = (page - 1) * limit;

    // Build query - only published blogs; fields are whitelisted above so
    // no request object ever reaches the Mongo filter.
    const query: Record<string, unknown> = { status: "published" };
    if (search) query.$text = { $search: search };
    if (category) query.categories = category.toLowerCase();
    if (tag) query.tags = tag.toLowerCase();

    // Execute query
    const [blogs, total] = await Promise.all([
      Blog.find(query)
        .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
        .skip(skip)
        .limit(limit)
        .select(
          "title slug excerpt featuredImage featuredImageAlt categories tags views readTime publishedAt authorName"
        )
        .lean(),
      Blog.countDocuments(query),
    ]);

    return NextResponse.json({
      blogs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logger.error("blogs list failed", toLogError(err));
    return fail("Failed to fetch blogs", 500, "BLOGS_FAILED");
  }
}
