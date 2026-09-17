import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Blog from "@/models/Blog";

// GET - Get all categories from published blogs
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const categories = await Blog.aggregate([
      { $match: { status: "published" } },
      { $unwind: "$categories" },
      {
        $group: {
          _id: "$categories",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      {
        $project: {
          _id: 0,
          name: "$_id",
          count: 1,
        },
      },
    ]);

    return NextResponse.json({ categories });
  } catch (error: any) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch categories" },
      { status: 500 }
    );
  }
}
