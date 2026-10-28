import { createHash } from "crypto";
import ClientWorkspaceModel from "@/models/ClientWorkspace";
import type mongoose from "mongoose";

/**
 * Agency client portal resolution (the page the /api/agency/clients
 * POST response links to as /portal/[token]).
 *
 * Tokens are never stored: only their SHA-256 hash is in the database,
 * and links expire (portalExpiresAt, default 90 days at creation).
 * The portal itself is read-only — it shows workspace info and linked
 * store summaries, never tokens, secrets, or edit controls.
 */
export type PortalResolution =
  | { status: "ok"; client: PortalClient }
  | { status: "expired" }
  | { status: "invalid" };

export interface PortalClient {
  id: string;
  name: string;
  clientEmail?: string;
  brandLogoUrl?: string;
  brandColor?: string;
  brandDomain?: string;
  storeIds: mongoose.Types.ObjectId[];
  portalExpiresAt?: Date;
}

export async function resolvePortalClient(token: string): Promise<PortalResolution> {
  if (!token) return { status: "invalid" };
  const hash = createHash("sha256").update(token).digest("hex");
  const doc = await ClientWorkspaceModel.findOne({ portalTokenHash: hash })
    .select("-portalTokenHash")
    .lean();
  if (!doc) return { status: "invalid" };
  if (doc.portalExpiresAt && new Date(doc.portalExpiresAt).getTime() < Date.now()) {
    return { status: "expired" };
  }
  return {
    status: "ok",
    client: {
      id: String(doc._id),
      name: doc.name,
      clientEmail: doc.clientEmail,
      brandLogoUrl: doc.brandLogoUrl,
      brandColor: doc.brandColor,
      brandDomain: doc.brandDomain,
      storeIds: doc.storeIds ?? [],
      portalExpiresAt: doc.portalExpiresAt,
    },
  };
}

/** Only a hex colour is honoured as a brand accent; anything else falls back. */
export function safeBrandColor(color?: string): string | undefined {
  if (color && /^#[0-9a-fA-F]{3,8}$/.test(color)) return color;
  return undefined;
}
