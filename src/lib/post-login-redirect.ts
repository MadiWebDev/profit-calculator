/**
 * Post-login landing-page decision.
 *
 * A superAdmin lands straight on the admin panel (/admin); everyone else
 * lands on the dashboard (/dashboard). An explicit callbackUrl deep link
 * (e.g. invite links) always wins over the role default.
 *
 * The role MUST come from the server-issued session (JWT callback in
 * src/lib/auth.ts reads it from the DB on every sign-in / refresh) — never
 * from a client-supplied value. /admin is additionally gated server-side
 * (src/app/admin/layout.tsx redirects non-superAdmins to /dashboard), so a
 * wrong destination here is a UX bug, not a security hole.
 */
export function resolvePostLoginRedirect(args: {
  /** Role from the server-issued session (`session.user.role`). */
  role?: string | null;
  /** The raw `callbackUrl` search param, if one was present. */
  callbackUrl?: string | null;
  /** True only when the `callbackUrl` param was explicitly present. */
  hasExplicitCallbackUrl?: boolean;
}): string {
  const { role, callbackUrl, hasExplicitCallbackUrl } = args;
  if (hasExplicitCallbackUrl && callbackUrl) return callbackUrl;
  if (role === "superAdmin") return "/admin";
  return "/dashboard";
}
