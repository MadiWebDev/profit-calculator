import { Suspense } from "react";
import BlogEditorClient from "../[id]/BlogEditorClient";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "New Blog Post | Admin",
  description: "Create a new blog post",
};

export default function NewBlogPage() {
  return (
    <div>
      <Suspense fallback={<EditorSkeleton />}>
        <BlogEditorClient />
      </Suspense>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
