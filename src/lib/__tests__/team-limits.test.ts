/**
 * Team-member plan limits.
 *
 * The code counts EVERY active member including the owner (see
 * getUsage in entitlements.ts, where the owner alone is baseline 1),
 * so the plan limit is always 1 + the number of extra members the
 * plan may invite:
 *   free/starter: 1 total = owner only, no invites
 *   growth:       2 total = owner + 1 member
 *   pro:          6 total = owner + 5 members
 * Marketing copy states the extra-member number (0 / 1 / 5) — these
 * assertions pin the enforcement side so copy and enforcement cannot
 * drift apart again.
 */
import { describe, it, expect } from "vitest";
import { PLAN_LIMITS, getPlanLimits } from "@/lib/plans";
import { getTiers } from "@/lib/tiers";

describe("team member limits", () => {
  it("enforces owner-only Starter, +1 Growth, +5 Pro (totals incl. owner)", () => {
    expect(PLAN_LIMITS.free.teamMembers).toBe(1);
    expect(PLAN_LIMITS.starter.teamMembers).toBe(1);
    expect(PLAN_LIMITS.growth.teamMembers).toBe(2);
    expect(PLAN_LIMITS.pro.teamMembers).toBe(6);
    expect(getPlanLimits("pro").teamMembers).toBe(6);
  });

  it("advertises the extra-member numbers in the tier features", () => {
    const tiers = getTiers();
    expect(tiers.find((t) => t.id === "starter")?.features).toContain("No team members");
    expect(tiers.find((t) => t.id === "growth")?.features).toContain("1 team member");
    expect(tiers.find((t) => t.id === "pro")?.features).toContain("5 team members");
    // No tier may still advertise the old limits.
    for (const tier of tiers) {
      expect(tier.features).not.toContain("2 team members");
      expect(tier.features).not.toContain("Unlimited team members");
    }
  });
});
