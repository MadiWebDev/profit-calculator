import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Blog from "@/models/Blog";

// GET - Get single blog by slug (public)
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
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
  } catch (error: any) {
    console.error("Error fetching blog:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch blog" },
      { status: 500 }
    );
  }
}
