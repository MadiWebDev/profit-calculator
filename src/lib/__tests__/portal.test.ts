import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "crypto";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "@/lib/__tests__/setup-db";
import ClientWorkspaceModel from "@/models/ClientWorkspace";
import { resolvePortalClient, safeBrandColor } from "@/lib/portal";

beforeAll(async () => {
  await setupTestDb();
  await clearDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe("agency portal token resolution", () => {
  it("resolves a valid token, rejects unknown tokens, and reports expired links", async () => {
    const teamId = new mongoose.Types.ObjectId();
    const goodToken = "portal-token-good-123";
    const expiredToken = "portal-token-expired-456";
    await ClientWorkspaceModel.create({
      agencyTeamId: teamId,
      name: "Good Client",
      portalTokenHash: createHash("sha256").update(goodToken).digest("hex"),
      portalExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      permissions: ["read:reports"],
    });
    await ClientWorkspaceModel.create({
      agencyTeamId: teamId,
      name: "Expired Client",
      portalTokenHash: createHash("sha256").update(expiredToken).digest("hex"),
      portalExpiresAt: new Date(Date.now() - 1000),
      permissions: ["read:reports"],
    });

    const ok = await resolvePortalClient(goodToken);
    expect(ok.status).toBe("ok");
    if (ok.status === "ok") {
      expect(ok.client.name).toBe("Good Client");
      expect(ok.client).not.toHaveProperty("portalTokenHash");
    }
    expect((await resolvePortalClient("nope")).status).toBe("invalid");
    expect((await resolvePortalClient(expiredToken)).status).toBe("expired");
  });

  it("only honours hex brand colours", () => {
    expect(safeBrandColor("#4F46E5")).toBe("#4F46E5");
    expect(safeBrandColor("javascript:alert(1)")).toBeUndefined();
    expect(safeBrandColor(undefined)).toBeUndefined();
  });
});
