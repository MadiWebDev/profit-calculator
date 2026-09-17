import mongoose, { Schema, Document, model, models } from "mongoose";

export interface IBlog extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  featuredImage?: string;
  featuredImageAlt?: string;
  author: mongoose.Types.ObjectId;
  authorName: string; // Denormalized for performance
  status: "draft" | "published" | "archived";
  publishedAt?: Date;
  categories: string[];
  tags: string[];
  
  // SEO Fields
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string[];
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: "summary" | "summary_large_image" | "app" | "player";
  canonicalUrl?: string;
  
  // Engagement
  views: number;
  readTime: number; // in minutes
  
  // Related content
  relatedPosts?: mongoose.Types.ObjectId[];
  
  createdAt: Date;
  updatedAt: Date;
}

const BlogSchema = new Schema<IBlog>(
  {
    title: { 
      type: String, 
      required: true, 
      trim: true,
      maxlength: 200 
    },
    slug: { 
      type: String, 
      required: true, 
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    content: { 
      type: String, 
      required: true 
    },
    excerpt: { 
      type: String, 
      required: true,
      maxlength: 500 
    },
    featuredImage: String,
    featuredImageAlt: String,
    author: { 
      type: Schema.Types.ObjectId, 
      ref: "User",
      required: true,
      index: true
    },
    authorName: {
      type: String,
      required: true
    },
    status: { 
      type: String, 
      enum: ["draft", "published", "archived"], 
      default: "draft",
      index: true
    },
    publishedAt: {
      type: Date,
      index: true
    },
    categories: [{
      type: String,
      trim: true,
      lowercase: true,
      index: true
    }],
    tags: [{
      type: String,
      trim: true,
      lowercase: true,
      index: true
    }],
    
    // SEO Fields
    metaTitle: { 
      type: String,
      maxlength: 60 
    },
    metaDescription: { 
      type: String,
      maxlength: 160 
    },
    metaKeywords: [String],
    ogTitle: { 
      type: String,
      maxlength: 60 
    },
    ogDescription: { 
      type: String,
      maxlength: 160 
    },
    ogImage: String,
    twitterCard: {
      type: String,
      enum: ["summary", "summary_large_image", "app", "player"],
      default: "summary_large_image"
    },
    canonicalUrl: String,
    
    // Engagement
    views: {
      type: Number,
      default: 0,
      index: true
    },
    readTime: {
      type: Number,
      default: 5
    },
    
    // Related content
    relatedPosts: [{
      type: Schema.Types.ObjectId,
      ref: "Blog"
    }]
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for performance
BlogSchema.index({ status: 1, publishedAt: -1 });
BlogSchema.index({ categories: 1, status: 1 });
BlogSchema.index({ tags: 1, status: 1 });
BlogSchema.index({ title: "text", excerpt: "text", content: "text" });

// Pre-save middleware to auto-generate slug if not provided
BlogSchema.pre("save", async function() {
  if (this.isModified("title") && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
  
  // Auto-set publishedAt when status changes to published
  if (this.isModified("status") && this.status === "published" && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  // Calculate read time (average 200 words per minute)
  if (this.isModified("content")) {
    const wordCount = this.content.split(/\s+/).length;
    this.readTime = Math.max(1, Math.ceil(wordCount / 200));
  }
});

export default models.Blog || model<IBlog>("Blog", BlogSchema);
