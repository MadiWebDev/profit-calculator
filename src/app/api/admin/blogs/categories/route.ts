import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Blog from "@/models/Blog";

// GET - Get all unique categories with blog counts
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (session.user as any).role;
    if (role !== "superAdmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await connectDB();

    // Get all unique categories with counts
    const categories = await Blog.aggregate([
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
