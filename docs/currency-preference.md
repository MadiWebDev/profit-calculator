# Currency preference: per-user display currency + location auto-detect

## The rule (one precedence, everywhere)

The display currency — the currency every money figure in the app is
shown in, converted at the live FX rate — is resolved in this order:

```
saved user preference  >  team workspace setting  >  browser (localStorage)
  >  geo-detected  >  store/report base  >  USD
```

Implemented in `src/lib/display-currency.ts` (`resolveDisplayCurrency`).
A saved preference **never changes by itself**: nothing automatic ever
overrides it, and the location detection only ever *seeds* the default
when nothing higher in the order exists.

## The moving parts

| Piece | Where | Notes |
|---|---|---|
| Per-user field | `src/models/User.ts` (`displayCurrency`) | Optional `string`, upper-cased, `^[A-Z]{3}$`. No default, no migration. |
| Session | `src/lib/auth.ts` (`authorize` + `jwt` backfill), `src/lib/auth.config.ts` (`jwt` + `session` callbacks), `src/types/next-auth.d.ts` | The JWT is re-read from the DB on sign-in, token refresh, and every `update()` call, so a save/clear propagates within the same browser session. |
| Save API | `PATCH /api/user` (`src/app/api/user/route.ts`) | Accepts `displayCurrency` (3-letter code, case-insensitive) or `null` to clear (`$unset`). Same auth and rate limit as the existing name/phone update; `settings.updated` audit entry. Writes only the signed-in user's own account. |
| Geo endpoint | `GET /api/geo/currency` (`src/app/api/geo/currency/route.ts`) | Reads Vercel's `x-vercel-ip-country` header → `currencyForCountry`. Returns `{ country, currency, source: "vercel-geo" \| "none" }`, `Cache-Control: private, no-store`. **No auth, no DB, no IP stored or logged** — the country code is the only thing that leaves the edge. |
| Country → currency | `src/lib/country-currency.ts` (`currencyForCountry`) | 221 country entries generated from the currency registry's locales plus union overrides (Eurozone → EUR, WAEMU → XOF, CEMAC → XAF, ECCU → XCD, dollarized/shared currencies → USD/AUD/NZD/CHF/GBP/DKK/XPF/NOK). Returns `null` for unknown/invalid codes. Every code in the registry is reachable from at least one country. |
| Browser-language fallback | `src/components/dashboard/CurrencyContext.tsx` | When the geo endpoint returns no currency (local dev, non-Vercel deploys, missing header), the provider derives the region from `navigator.language` (e.g. `en-PK` → `PK` → PKR). |
| Provider | `src/components/dashboard/CurrencyContext.tsx` (`CurrencyProvider`) | One resolution effect combines the five sources with `resolveDisplayCurrency`. The detected value is cached in localStorage (`profit_detected_currency`) separately from the explicit choice (`profit_selected_currency`), so a detection never overwrites a saved preference. The cache is trusted for **24 h** (`DETECTED_CURRENCY_TTL_MS` in `src/lib/geo-detection.ts`): a fresh entry is used without re-fetching, an expired entry — or one written before the TTL existed, which has no timestamp — is re-fetched on the next visit, and is kept only as a fail-open fallback if that re-fetch fails (the stored entry keeps its old timestamp, so the next visit retries). Only an *explicit pick* is ever written to `profit_selected_currency` — resolution-driven values (session, team, geo, store) are never persisted there, so a detected default can never turn into a fake "choice" that blocks a later detection. `resetCurrencyPreference()` (Settings reset) clears the guard **and** removes the stored choice, so "automatic" really returns to detection. The provider exposes `detectedCurrency` and `resetCurrencyPreference()`; `setCurrency(code, { persist?: boolean })` saves to `PATCH /api/user` (not the team setting) and refreshes the session so the JWT converges. Logged-out visitors keep localStorage-only behaviour — nothing is ever POSTed for them. |
| Settings UI | `src/app/(dashboard)/dashboard/settings/SettingsClient.tsx` (Profile tab) + `src/app/(dashboard)/dashboard/settings/page.tsx` | Currency card above the Workspace card: searchable selector over the full 148-currency registry, a "Saved preference" line, a "Detected from your location" line (country name via `Intl.DisplayNames`), "Currently showing figures in …", Save (via `useAsyncAction` + loading `Button`) and "Use automatic detection" reset (PATCH `displayCurrency: null`). After save/reset the session is refreshed with `useSession().update()` and the provider is re-pointed (`setCurrency(…, { persist: false })` / `resetCurrencyPreference()`). |
| Navbar converter | `src/components/dashboard/CurrencySelector.tsx` | Unchanged UI, still global (already on calculator pages). It now saves the **user** preference via `setCurrency` instead of the team workspace setting — one team member changing it no longer changes it for the whole team. |
| Team currency page | `src/app/(dashboard)/dashboard/currency/page.tsx` | The display-currency field was removed: nothing writes the workspace display setting any more, so it is now a read-only legacy fallback (the team default for members with no personal preference). Reporting currency, FX source, and manual overrides are unchanged. |
| Workspace settings (GET + model) | `src/app/api/settings/workspace/route.ts`, `src/models/WorkspaceSettings.ts` | **Plan deviation, required for geo to work at all** (see below): the GET now returns the *raw* `displayCurrency` — `null` when the team never chose one — instead of defaulting it to `"USD"` (or to the reporting currency). The Mongoose field no longer has `default: "USD"` for the same reason: a defaulted value is indistinguishable from an explicit choice, and either would block location auto-detect for every team that never picked a currency. Teams that *did* set a display currency keep exactly that value. The PATCH still accepts `displayCurrency`; the reporting-currency fallback now lives in the display precedence itself (below geo), so nothing is lost. |

## What did NOT change

- **Report-base currency** (`report-currency.ts`, `getReportBaseCurrency`): reports are still aggregated in the team's most common store currency. Display conversion happens only at render time.
- **FX pipeline** (`/api/fx/rates`, 60 s refresh, provider chain): untouched.
- **Business logic**: no route, query, or API payload changes beyond the `displayCurrency` field; no copy changes beyond currency UI text.
- **The converter was NOT duplicated** into calculator right rails — one control, one source of truth, in the navbar.

## Guarantees and edge cases

- **Saved never changes by itself.** The only writers of `User.displayCurrency` are the Settings save/reset and the navbar converter — both explicit user actions, both scoped to the signed-in user.
- **Reset really resets.** "Use automatic detection" clears the saved preference *and* the browser's stored choice, so the detected currency returns. A detected value is never written to the stored-choice key — otherwise the first detection would permanently block later ones (e.g. PKR detected on one trip beating a EUR detection on the next).
- **A second team member is unaffected** by your change: the preference lives on the `User` document, not the team workspace setting.
- **Signed out?** The converter still works (localStorage only) and geo detection still seeds the default; no `/api/user` request is ever made.
- **A cached detection expires after 24 h.** A traveller's default is re-fetched on the next visit once the cached detection is older than a day; entries written before the TTL existed carry no timestamp and count as expired, so they re-fetch on the first visit after this change. If the re-fetch fails, the expired value is used as a fallback rather than nothing (and the next visit retries). The TTL touches the detected default only — a saved preference, team setting, or explicit browser choice still outranks detection and still blocks the geo fetch entirely.
- **Invalid codes are ignored everywhere** (registry-membership check, not just shape): a stale or hand-edited value in any source falls through to the next one.
- **No geo header (local dev)?** The endpoint returns `source: "none"`, and the provider falls back to the browser language, then the store currency, then USD.
- **Privacy:** no IP address is stored or logged anywhere in this feature; the geo endpoint takes no user data and touches no database; the detected country is never logged alongside a user id.
