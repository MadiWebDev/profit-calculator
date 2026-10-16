import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Blog, { IBlog } from "@/models/Blog";
import type { QueryFilter } from "mongoose";
import { logger } from "@/lib/logger";

interface SessionUser {
  id?: string;
  role?: string;
  name?: string | null;
}

// GET - List all blogs (admin)
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (session.user as SessionUser).role;
    if (role !== "superAdmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const tag = searchParams.get("tag");
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? 1 : -1;

    const skip = (page - 1) * limit;

    // Build query
    const query: QueryFilter<IBlog> = {};
    if (status === "draft" || status === "published" || status === "archived") {
      query.status = status;
    }
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
        .populate("author", "name email image")
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
  } catch (error: unknown) {
    logger.error("Error fetching blogs", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch blogs" },
      { status: 500 }
    );
  }
}

// POST - Create new blog
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (session.user as SessionUser).role;
    if (role !== "superAdmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await connectDB();

    const data = await req.json();

    // Validate required fields
    if (!data.title || !data.content || !data.excerpt) {
      return NextResponse.json(
        { error: "Title, content, and excerpt are required" },
        { status: 400 }
      );
    }

    // Generate slug if not provided
    let slug = data.slug;
    if (!slug) {
      slug = data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    // Check for duplicate slug
    const existingBlog = await Blog.findOne({ slug });
    if (existingBlog) {
      slug = `${slug}-${Date.now()}`;
    }

    // Create blog
    const blog = await Blog.create({
      ...data,
      slug,
      author: (session.user as SessionUser).id,
      authorName: (session.user as SessionUser).name,
    });

    const populatedBlog = await Blog.findById(blog._id)
      .populate("author", "name email image")
      .lean();

    return NextResponse.json({
      success: true,
      blog: populatedBlog,
    }, { status: 201 });

  } catch (error: unknown) {
    logger.error("Error creating blog", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create blog" },
      { status: 500 }
    );
  }
}
