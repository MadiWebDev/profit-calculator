import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Blog from "@/models/Blog";

// GET - Get all tags from published blogs
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const tags = await Blog.aggregate([
      { $match: { status: "published" } },
      { $unwind: "$tags" },
      {
        $group: {
          _id: "$tags",
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

    return NextResponse.json({ tags });
  } catch (error: any) {
    console.error("Error fetching tags:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch tags" },
      { status: 500 }
    );
  }
}
