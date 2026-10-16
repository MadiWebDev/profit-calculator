import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import { setupTestDb, teardownTestDb, clearDb } from "./setup-db";
import { can, outranks, lastOwnerGuard, type Permission } from "@/lib/permissions";
import type { TeamRole } from "@/models/Team";
import TeamModel from "@/models/Team";

beforeAll(async () => {
  await setupTestDb();
}, 60000);
afterAll(async () => {
  await teardownTestDb();
});
beforeEach(async () => {
  await clearDb();
});

const ROLES: TeamRole[] = ["owner", "admin", "member", "viewer"];

describe("can() — permission matrix", () => {
  const expected: Record<Permission, TeamRole[]> = {
    "write:data": ["owner", "admin", "member"],
    "edit:cogs": ["owner", "admin", "member"],
    "manage:team": ["owner", "admin"],
    "manage:billing": ["owner"],
    "manage:apikeys": ["owner", "admin"],
    "view:audit": ["owner", "admin"],
  };

  for (const [perm, allowed] of Object.entries(expected)) {
    for (const role of ROLES) {
      it(`${role} ${allowed.includes(role) ? "CAN" : "CANNOT"} ${perm}`, () => {
        expect(can(role, perm as Permission)).toBe(allowed.includes(role));
      });
    }
  }

  it("viewer is read-only: no permissions at all", () => {
    const perms: Permission[] = ["write:data", "edit:cogs", "manage:team", "manage:billing", "manage:apikeys", "view:audit"];
    for (const p of perms) expect(can("viewer", p)).toBe(false);
  });

  it("owner has every permission", () => {
    const perms: Permission[] = ["write:data", "edit:cogs", "manage:team", "manage:billing", "manage:apikeys", "view:audit"];
    for (const p of perms) expect(can("owner", p)).toBe(true);
  });

  it("undefined/null role grants nothing", () => {
    expect(can(undefined, "write:data")).toBe(false);
    expect(can(null, "write:data")).toBe(false);
  });
});

describe("outranks()", () => {
  it("owner > admin > member > viewer", () => {
    expect(outranks("owner", "admin")).toBe(true);
    expect(outranks("admin", "member")).toBe(true);
    expect(outranks("member", "viewer")).toBe(true);
    expect(outranks("viewer", "owner")).toBe(false);
    expect(outranks("admin", "admin")).toBe(true); // equal ranks as "outranks"
  });
});

async function makeTeamWithMembers(
  members: Array<{ role: TeamRole; status?: "active" | "pending" }>
) {
  const ownerId = new mongoose.Types.ObjectId();
  return TeamModel.create({
    name: "T",
    slug: `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ownerId,
    members: members.map((m) => ({
      userId: new mongoose.Types.ObjectId(),
      role: m.role,
      status: m.status ?? "active",
      invitedAt: new Date(),
    })),
    plan: "free",
  });
}

describe("lastOwnerGuard()", () => {
  it("blocks removing the only active owner", async () => {
    const team = await makeTeamWithMembers([{ role: "owner" }]);
    const onlyOwner = team.members[0].userId.toString();
    const msg = await lastOwnerGuard(team._id.toString(), onlyOwner);
    expect(msg).toMatch(/last owner/i);
  });

  it("blocks downgrading the only active owner", async () => {
    const team = await makeTeamWithMembers([
      { role: "owner" },
      { role: "member" },
    ]);
    const onlyOwner = team.members[0].userId.toString();
    const msg = await lastOwnerGuard(team._id.toString(), onlyOwner);
    expect(msg).toMatch(/last owner/i);
  });

  it("allows removing an owner when another active owner exists", async () => {
    const team = await makeTeamWithMembers([{ role: "owner" }, { role: "owner" }]);
    const first = team.members[0].userId.toString();
    expect(await lastOwnerGuard(team._id.toString(), first)).toBeNull();
  });

  it("allows removing a non-owner", async () => {
    const team = await makeTeamWithMembers([{ role: "owner" }, { role: "member" }]);
    const member = team.members[1].userId.toString();
    expect(await lastOwnerGuard(team._id.toString(), member)).toBeNull();
  });

  it("pending owners don't count — still blocked", async () => {
    const team = await makeTeamWithMembers([
      { role: "owner", status: "active" },
      { role: "owner", status: "pending" },
    ]);
    const active = team.members[0].userId.toString();
    const msg = await lastOwnerGuard(team._id.toString(), active);
    expect(msg).toMatch(/last owner/i);
  });

  it("returns null for unknown members", async () => {
    const team = await makeTeamWithMembers([{ role: "owner" }]);
    expect(
      await lastOwnerGuard(team._id.toString(), new mongoose.Types.ObjectId().toString())
    ).toBeNull();
  });
});
