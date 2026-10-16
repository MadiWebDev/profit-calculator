import { Suspense } from "react";
import BlogEditorClient from "./BlogEditorClient";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Edit Blog | Admin",
  description: "Edit blog post",
};

export default async function EditBlogPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params;
  
  return (
    <div>
      <Suspense fallback={<EditorSkeleton />}>
        <BlogEditorClient blogId={id} />
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
