/**
 * Dashboard footer collapse.
 *
 * The site footer is a tall link farm (brand, product, company and a
 * full calculator directory). On dashboard pages it eats the viewport
 * on small screens, so there it can be closed and reopened. The choice
 * is remembered per browser in localStorage.
 */

export const DASHBOARD_FOOTER_STORAGE_KEY = "getprofitcalc:dashboard-footer";

export type DashboardFooterPreference = "open" | "closed";

/** Dashboard pages live under /dashboard. */
export function isDashboardPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

/** Accept only the two values we write; anything else means "no preference". */
export function parseStoredPreference(
  value: string | null | undefined,
): DashboardFooterPreference | null {
  return value === "open" || value === "closed" ? value : null;
}

export function serializePreference(collapsed: boolean): DashboardFooterPreference {
  return collapsed ? "closed" : "open";
}

/**
 * Decide whether the dashboard footer starts collapsed.
 * A saved preference wins; otherwise small screens start collapsed
 * (the footer is a long link list) and larger screens start expanded.
 */
export function resolveDashboardFooterCollapsed(args: {
  stored: DashboardFooterPreference | null;
  isSmallScreen: boolean;
}): boolean {
  if (args.stored === "closed") return true;
  if (args.stored === "open") return false;
  return args.isSmallScreen;
}
