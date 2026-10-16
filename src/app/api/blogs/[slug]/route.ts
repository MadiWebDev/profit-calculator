import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rate-limit";
import { connectDB } from "@/lib/db";
import Blog from "@/models/Blog";
import { fail } from "@/lib/validation";
import { logger, toLogError } from "@/lib/logger";

// GET - Get single blog by slug (public)
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const rl = await withRateLimit(req, "lenient", "blogs");
  if (rl) return rl;

  try {
    await connectDB();

    const { slug } = await context.params;

    // Find published blog by slug
    const blog = await Blog.findOne({ slug, status: "published" })
      .populate("author", "name image")
      .populate("relatedPosts", "title slug excerpt featuredImage publishedAt readTime")
      .lean();

    if (!blog) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }

    // Increment view count asynchronously (don't await)
    Blog.findByIdAndUpdate(blog._id, { $inc: { views: 1 } }).exec();

    return NextResponse.json({ blog });
  } catch (err) {
    logger.error("blog fetch failed", toLogError(err));
    return fail("Failed to fetch blog", 500, "BLOG_FAILED");
  }
}
