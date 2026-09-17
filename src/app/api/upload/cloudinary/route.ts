import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check admin role
    const role = (session.user as any).role;
    if (role !== "superAdmin") {
      return NextResponse.json(
        { error: "Forbidden - Admin access required" },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const folder = formData.get("folder") as string || "blog";

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(base64, {
      folder: `profitcalc/${folder}`,
      resource_type: "auto",
      transformation: [
        { width: 1200, height: 630, crop: "limit", quality: "auto", fetch_format: "auto" }
      ]
    });

    return NextResponse.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
    });

  } catch (error: any) {
    console.error("Cloudinary upload error:", error);
    return NextResponse.json(
      { error: error.message || "Upload failed" },
      { status: 500 }
    );
  }
}

// Delete image from Cloudinary
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (session.user as any).role;
    if (role !== "superAdmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { publicId } = await req.json();

    if (!publicId) {
      return NextResponse.json(
        { error: "Public ID required" },
        { status: 400 }
      );
    }

    await cloudinary.uploader.destroy(publicId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Cloudinary delete error:", error);
    return NextResponse.json(
      { error: error.message || "Delete failed" },
      { status: 500 }
    );
  }
}
