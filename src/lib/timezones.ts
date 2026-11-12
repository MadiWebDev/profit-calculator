/**
 * IANA timezone helpers — shared by the onboarding modal (picker +
 * validation), the write-once lock in PATCH /api/user, and the
 * dashboard display-timezone formatter.
 *
 * Validation is deliberately strict: the value must both look like an
 * IANA zone AND be accepted by Intl.DateTimeFormat, so a hand-crafted
 * string can never be stored and later crash a formatter.
 */

// Short curated fallback, used only when Intl.supportedValuesOf is
// unavailable (very old runtimes). Mirrors the Settings workspace list.
export const FALLBACK_TIMEZONES = [
  "UTC",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Sao_Paulo", "America/Toronto", "America/Vancouver",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
  "Europe/Rome", "Europe/Amsterdam", "Europe/Warsaw", "Europe/Istanbul",
  "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo",
  "Asia/Shanghai", "Asia/Seoul", "Australia/Sydney", "Pacific/Auckland",
];

/** Full IANA list from the runtime (300+ zones), with the curated fallback. */
export function getSupportedTimezones(): string[] {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (Array.isArray(supported) && supported.length > 0) {
      // The runtime list omits "UTC" itself, but it is the team
      // default and a valid selection — always offer it first.
      return supported.includes("UTC") ? [...supported] : ["UTC", ...supported];
    }
  } catch {
    // Fall through to the curated list below.
  }
  return [...FALLBACK_TIMEZONES];
}

/** IANA shape: "UTC" or "Region/City" (optionally deeper, e.g. "America/Argentina/Buenos_Aires"). */
const TIMEZONE_SHAPE = /^(UTC|[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)+)$/;

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 80) return false;
  if (!TIMEZONE_SHAPE.test(value)) return false;
  try {
    // Intl is the authority: a well-shaped string that is not a real
    // zone (e.g. "Mars/Olympus") throws here.
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
