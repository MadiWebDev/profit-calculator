import { Suspense } from "react";
import { UsersClient } from "./UsersClient";

export const dynamic = "force-dynamic";

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<div className="text-[var(--color-muted-foreground)] text-sm">Loading users…</div>}>
      <UsersClient />
    </Suspense>
  );
}
