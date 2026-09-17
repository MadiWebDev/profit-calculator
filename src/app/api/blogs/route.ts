import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Blog from "@/models/Blog";

// GET - Public blog listing (only published blogs)
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "12");
    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const tag = searchParams.get("tag");
    const sortBy = searchParams.get("sortBy") || "publishedAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? 1 : -1;

    const skip = (page - 1) * limit;

    // Build query - only published blogs
    const query: any = { status: "published" };

    if (search) {
      query.$text = { $search: search };
    }
    if (category) {
      query.categories = category.toLowerCase();
    }
    if (tag) {
      query.tags = tag.toLowerCase();
    }

    // Execute query
    const [blogs, total] = await Promise.all([
      Blog.find(query)
        .sort({ [sortBy]: sortOrder })
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
  } catch (error: any) {
    console.error("Error fetching blogs:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch blogs" },
      { status: 500 }
    );
  }
}
