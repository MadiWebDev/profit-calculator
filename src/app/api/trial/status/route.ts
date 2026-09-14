import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAccountStatus } from "@/lib/trial";

/**
 * GET /api/trial/status
 *
 * Returns the current trial / account status for the authenticated user's team.
 * Used by client components that need to poll or check archival state.
 *
 * Response shape:
 * {
 *   status:       "trialing" | "active" | "past_due" | "cancelled" | "archived"
 *   trialEndsAt:  string (ISO) | null
 *   daysLeft:     number
 *   isArchived:   boolean
 * }
 */
export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamId = (session.user as { teamId?: string }).teamId;

  if (!teamId) {
    // No team yet (e.g. mid-onboarding) — treat as trialing with 7 days
    return NextResponse.json({
      status: "trialing",
      trialEndsAt: null,
      daysLeft: 7,
      isArchived: false,
    });
  }

  try {
    const info = await getAccountStatus(teamId);
    return NextResponse.json({
      status: info.status,
      trialEndsAt: info.trialEndsAt ? info.trialEndsAt.toISOString() : null,
      daysLeft: info.daysLeft,
      isArchived: info.isArchived,
    });
  } catch (err) {
    console.error("[trial/status]", err);
    return NextResponse.json({ error: "Failed to fetch trial status" }, { status: 500 });
  }
}
