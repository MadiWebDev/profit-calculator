/**
 * Onboarding lock — pure, testable rules behind the onboarding modal
 * and the write-once enforcement in PATCH /api/user.
 *
 * The lock is total, not change-detection: once a value is set, ANY
 * further write to that field — the same value, a different value, or
 * a clear (null) — is rejected with 400 and changes nothing. A lock
 * that accepts a "no-op" re-save is a lock with a hole in it.
 */
import { isValidTimezone } from "@/lib/timezones";

export type LockedFieldCode = "CURRENCY_LOCKED" | "TIMEZONE_LOCKED";

export interface LockedFieldDecision {
  ok: boolean;
  code?: LockedFieldCode;
  message?: string;
}

export interface CurrentLockedFields {
  displayCurrency?: string | null;
  timezone?: string | null;
}

export interface IncomingLockedFields {
  /** undefined = not sent; null = clear attempt; string = new value. */
  displayCurrency?: string | null;
  timezone?: string | null;
}

/**
 * Decide whether a PATCH /api/user write to the locked fields may
 * proceed. Currency is checked first so a request that tries to
 * change both reports CURRENCY_LOCKED. Name/phone/onboardingCompleted
 * are never decided here — they stay changeable.
 */
export function decideLockedUpdate(
  current: CurrentLockedFields,
  incoming: IncomingLockedFields,
): LockedFieldDecision {
  if (
    incoming.displayCurrency !== undefined &&
    current.displayCurrency !== null &&
    current.displayCurrency !== undefined &&
    current.displayCurrency !== ""
  ) {
    return {
      ok: false,
      code: "CURRENCY_LOCKED",
      message: "Your display currency was set during onboarding and cannot be changed.",
    };
  }
  if (
    incoming.timezone !== undefined &&
    current.timezone !== null &&
    current.timezone !== undefined &&
    current.timezone !== ""
  ) {
    return {
      ok: false,
      code: "TIMEZONE_LOCKED",
      message: "Your timezone was set during onboarding and cannot be changed.",
    };
  }
  return { ok: true };
}

/**
 * The exact modal trigger rule (see the plan's grandfathering call):
 *
 *   show the modal  <=>  the user is signed in, has a team, and
 *   onboardingCompleted is not true.
 *
 * onboardingCompleted is the ONLY trigger. A grandfathered user who
 * already saved a displayCurrency still sees the modal while their
 * flag is false — but with the currency field locked to the saved
 * value and the timezone prefilled from their team's timezone — and
 * saving it (even with nothing to pick) sets the flag and ends
 * onboarding. A user whose flag is true never sees the modal again,
 * whatever their fields hold.
 */
export function needsOnboardingModal(input: {
  onboardingCompleted?: boolean | null;
  teamId?: string | null;
}): boolean {
  if (!input.teamId) return false;
  return input.onboardingCompleted !== true;
}

export interface OnboardingPrefill {
  /** True when the user already has a displayCurrency saved (grandfathered). */
  currencyLocked: boolean;
  /** Currency to pre-select: locked value, else geo-detected, else team, else USD. */
  currencyDefault: string;
  /** True when the user already has a timezone saved. */
  timezoneLocked: boolean;
  /** Timezone to pre-select: locked value, else team timezone, else browser timezone. */
  timezoneDefault: string;
  /** True when the timezone prefill came from the team's timezone. */
  timezonePrefillFromTeam: boolean;
}

export function resolveOnboardingPrefill(input: {
  displayCurrency?: string | null;
  timezone?: string | null;
  teamTimezone?: string | null;
  teamCurrency?: string | null;
  detectedCurrency?: string | null;
  browserTimezone?: string | null;
}): OnboardingPrefill {
  const currencyLocked = Boolean(input.displayCurrency);
  const currencyDefault = currencyLocked
    ? (input.displayCurrency as string)
    : input.detectedCurrency || input.teamCurrency || "USD";
  const timezoneLocked = Boolean(input.timezone);
  const teamTz = isValidTimezone(input.teamTimezone ?? null) ? (input.teamTimezone as string) : null;
  const browserTz = isValidTimezone(input.browserTimezone ?? null)
    ? (input.browserTimezone as string)
    : "UTC";
  return {
    currencyLocked,
    currencyDefault,
    timezoneLocked,
    timezoneDefault: timezoneLocked ? (input.timezone as string) : teamTz ?? browserTz,
    timezonePrefillFromTeam: !timezoneLocked && teamTz !== null,
  };
}
