import { Suspense } from "react";
import { MessageDetailClient } from "./MessageDetailClient";

export const dynamic = "force-dynamic";

export default async function AdminMessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<div className="text-[var(--color-muted-foreground)] text-sm">Loading message…</div>}>
      <MessageDetailClient messageId={id} />
    </Suspense>
  );
}
