/**
 * Server-only half of the money-currency helpers (order-currency fix,
 * Phase 2, unified with Phase 1 in ./money-currency.ts).
 *
 * deriveMoneyCurrency is the DB-backed derivation for API routes that
 * write money without a user-supplied currency: when a client sends a
 * currency it is validated as a 3-letter ISO 4217 code and used as-is;
 * when it sends none, the server derives one from the session, in this
 * precedence:
 *
 *   user displayCurrency > team currency > store currency
 *
 * ("Store currency" is the selected store's own currency when a
 * storeId is known, otherwise the team's most common store currency.)
 *
 * There is deliberately NO "USD" anywhere in this derivation: when no
 * source yields a valid code, it returns null and the caller must
 * reject the write (400 CURRENCY_REQUIRED) instead of silently
 * stamping the row USD. A team's own configured currency
 * (Team.currency, which the model defaults to "USD" at team creation)
 * is a legitimate answer — it is the team's setting, not a silent
 * per-write default.
 *
 * SERVER ONLY — never import this file from a client component (or
 * from ./money-currency.ts, which client components import). It pulls
 * in the mongoose models, and mongoose in the client bundle fails the
 * production build (Node built-ins: fs/net/tls/dns/…). API routes
 * import deriveMoneyCurrency from here directly.
 *
 * Callers must already be connected to the database (connectDB) — the
 * same convention as getTeamBaseCurrency in reporting.ts.
 */
import UserModel from "@/models/User";
import TeamModel from "@/models/Team";
import StoreModel from "@/models/Store";
import { normalizeMoneyCurrency, resolveMoneyCurrency } from "@/lib/money-currency";

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

function isObjectId(value: unknown): value is string {
  return typeof value === "string" && OBJECT_ID_RE.test(value);
}

/** Most common valid store currency for the team, or null when no store has one. */
async function mostCommonStoreCurrency(teamId: string): Promise<string | null> {
  const stores = await StoreModel.find({ teamId }).select("currency").lean();
  const counts = new Map<string, number>();
  for (const s of stores) {
    const code = normalizeMoneyCurrency((s as { currency?: unknown }).currency);
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [code, n] of counts) {
    if (n > bestCount) {
      best = code;
      bestCount = n;
    }
  }
  return best;
}

/**
 * DB-backed derivation for API routes. `userId` is the session user
 * (omitted for API-key callers, which have no user — the team step
 * then leads). `storeId`, when given, makes the store step that
 * store's own currency instead of the most-common one.
 *
 * Never throws for a missing/invalid id — an unreadable source is
 * treated as absent and the next source is tried.
 */
export async function deriveMoneyCurrency(input: {
  userId?: string | null;
  teamId: string;
  storeId?: string | null;
}): Promise<string | null> {
  let user: string | null = null;
  if (isObjectId(input.userId)) {
    try {
      const u = await UserModel.findById(input.userId).select("displayCurrency").lean();
      user = typeof u?.displayCurrency === "string" ? u.displayCurrency : null;
    } catch {
      user = null;
    }
  }

  let team: string | null = null;
  if (isObjectId(input.teamId)) {
    try {
      const t = await TeamModel.findById(input.teamId).select("currency").lean();
      team = typeof t?.currency === "string" ? t.currency : null;
    } catch {
      team = null;
    }
  }

  let store: string | null = null;
  try {
    if (isObjectId(input.storeId)) {
      const s = await StoreModel.findOne({ _id: input.storeId, teamId: input.teamId })
        .select("currency")
        .lean();
      store = typeof s?.currency === "string" ? s.currency : null;
    } else if (isObjectId(input.teamId)) {
      store = await mostCommonStoreCurrency(input.teamId);
    }
  } catch {
    store = null;
  }

  return resolveMoneyCurrency({ user, team, store });
}
