import { Suspense } from "react";
import BlogsClient from "./BlogsClient";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Blog Management | Admin",
  description: "Manage blog posts",
};

export default function AdminBlogsPage() {
  return (
    <div>
      <Suspense fallback={<BlogsListSkeleton />}>
        <BlogsClient />
      </Suspense>
    </div>
  );
}

function BlogsListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="flex gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    </div>
  );
}
