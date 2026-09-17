import { Metadata } from "next";
import { Suspense } from "react";
import BlogListClient from "./BlogListClient";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Blog | ProfitCalc - E-commerce Insights & Tips",
  description:
    "Discover expert insights, tips, and strategies for e-commerce success. Learn about profit optimization, ad spend management, and business growth.",
  openGraph: {
    title: "Blog | ProfitCalc",
    description:
      "Expert insights and strategies for e-commerce success",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog | ProfitCalc",
    description:
      "Expert insights and strategies for e-commerce success",
  },
};

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <Suspense fallback={<BlogListSkeleton />}>
        <BlogListClient />
      </Suspense>
    </div>
  );
}

function BlogListSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Skeleton className="h-12 w-64 mb-4" />
      <Skeleton className="h-6 w-96 mb-12" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
