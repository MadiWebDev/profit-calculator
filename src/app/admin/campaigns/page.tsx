import { Suspense } from "react";
import { CampaignsClient } from "./CampaignsClient";

export const dynamic = "force-dynamic";

export default function AdminCampaignsPage() {
  return (
    <Suspense fallback={<div className="text-[var(--color-muted-foreground)] text-sm">Loading campaigns…</div>}>
      <CampaignsClient />
    </Suspense>
  );
}
