import { connectDB } from "@/lib/db";
import { resolvePortalClient, safeBrandColor } from "@/lib/portal";
import StoreModel from "@/models/Store";
import OrderModel from "@/models/Order";

/**
 * Agency client portal — public, token-gated, read-only. Rendered from
 * the workspace resolved by the portal token hash; no session, no
 * tokens, no secrets, no edit controls. Shows the client's stores with
 * live order counts so an agency client can see what is being tracked
 * for them.
 */
export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await connectDB();
  const resolved = await resolvePortalClient(token);

  if (resolved.status === "invalid") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-bold">Portal link not found</h1>
        <p className="text-[var(--color-muted-foreground)]">This portal link is not valid. Ask your agency for a fresh link.</p>
      </div>
    );
  }
  if (resolved.status === "expired") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-bold">Portal link expired</h1>
        <p className="text-[var(--color-muted-foreground)]">This portal link has expired. Ask your agency for a fresh link.</p>
      </div>
    );
  }

  const { client } = resolved;
  const accent = safeBrandColor(client.brandColor);
  const stores = client.storeIds.length
    ? await StoreModel.find({ _id: { $in: client.storeIds } })
        .select("name domain platform isActive syncStatus")
        .lean()
    : [];
  const counts = await Promise.all(
    stores.map(async (s) => ({
      id: String(s._id),
      orders: await OrderModel.countDocuments({ storeId: s._id }),
    }))
  );
  const countById = new Map(counts.map((c) => [c.id, c.orders]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <div className="flex items-center gap-4 mb-8">
        {client.brandLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={client.brandLogoUrl} alt="" className="h-10 w-auto" />
        )}
        <div>
          <h1 className="text-3xl font-extrabold" style={accent ? { color: accent } : undefined}>{client.name}</h1>
          <p className="text-[var(--color-muted-foreground)]">Client portal — read-only profit tracking summary</p>
        </div>
      </div>

      {stores.length === 0 ? (
        <p className="text-[var(--color-muted-foreground)]">No stores are linked to this workspace yet. Your agency will link stores as onboarding progresses.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--color-muted-foreground)]">
              <th className="py-2">Store</th>
              <th className="py-2">Platform</th>
              <th className="py-2">Status</th>
              <th className="py-2">Orders tracked</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={String(s._id)} className="border-t">
                <td className="py-2">{s.name} <span className="text-[var(--color-muted-foreground)]">({s.domain})</span></td>
                <td className="py-2">{s.platform}</td>
                <td className="py-2">{s.isActive ? "Active" : (s.syncStatus ?? "Inactive")}</td>
                <td className="py-2">{countById.get(String(s._id)) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {client.portalExpiresAt && (
        <p className="mt-8 text-sm text-[var(--color-muted-foreground)]">
          This link expires on {new Date(client.portalExpiresAt).toLocaleDateString()}.
        </p>
      )}
    </div>
  );
}
