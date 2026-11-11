import { Suspense } from "react";
import { MessagesClient } from "./MessagesClient";

export const dynamic = "force-dynamic";

export default function AdminMessagesPage() {
  return (
    <Suspense fallback={<div className="text-[var(--color-muted-foreground)] text-sm">Loading messages…</div>}>
      <MessagesClient />
    </Suspense>
  );
}
