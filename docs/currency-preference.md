# Currency preference: per-user display currency + location auto-detect

## The onboarding lock (2026-11-12)

The display currency and the per-user timezone are now **write-once,
locked at onboarding** — the Settings card and the navbar converter can
no longer change them.

- **Onboarding modal** (`src/components/dashboard/OnboardingModal.tsx`,
  mounted in `src/app/(dashboard)/layout.tsx`): shown on the first
  dashboard visit when `onboardingCompleted` is not true and the user
  has a team. Fields: display name (prefilled, changeable later),
  currency (searchable, full 148-currency registry, defaults to the
  geo-detected currency), timezone (searchable IANA selector, defaults
  to the team's timezone, else the browser timezone). Warning copy:
  "Your currency and timezone apply to your entire dashboard and
  cannot be changed after you save. Your name can be changed anytime
  in Settings." Blocking — no close button, no skip — but the user can
  still sign out from inside the modal. One `PATCH /api/user` writes
  `displayCurrency` + `timezone` + `name` and sets
  `onboardingCompleted: true`; the modal never appears again.
- **Exact trigger rule** (`src/lib/onboarding-lock.ts`,
  `needsOnboardingModal`): show ⇔ signed in + has a team +
  `onboardingCompleted !== true`. A grandfathered user who already
  saved a `displayCurrency` still sees the modal while their flag is
  false — with the currency field locked to the saved value and the
  timezone prefilled from their team's timezone — and saving it sets
  the flag. A user whose flag is true never sees it again.
- **Server enforcement** (`PATCH /api/user`,
  `src/lib/onboarding-lock.ts` `decideLockedUpdate`): `displayCurrency`
  and `timezone` are accepted only while unset; if already set, the
  request returns **400 `CURRENCY_LOCKED` / `TIMEZONE_LOCKED`** and
  changes nothing — not even the name/phone in the same request. The
  lock is total: re-saving the same value or clearing (`null`) is also
  rejected. `name` and `phone` stay changeable; `onboardingCompleted`
  can only be set to `true`, never back to `false`. No superAdmin
  override in v1.
- **Per-user timezone** (`User.timezone`, IANA string, validated by
  `src/lib/timezones.ts` `isValidTimezone` — shape + `Intl` check).
  Exposed on the session the same way `displayCurrency` is
  (`src/lib/auth.ts` / `auth.config.ts` jwt + session callbacks,
  `src/types/next-auth.d.ts`). The team's timezone stays the workspace
  default and stays changeable in Settings → Workspace.
- **The navbar converter is now informational** (`CurrencySelector` /
  `CurrencyContext.setCurrency`): it switches a session-only,
  in-memory view currency — figures re-render for reference — and
  persists nothing (no `PATCH /api/user`, no localStorage write). The
  locked currency returns on reload or navigation. The footer
  `CurrencyConverter` widget was already informational and is unchanged.
- **Display timezone** (`src/lib/display-timezone.ts`,
  `src/components/dashboard/TimezoneContext.tsx`): the locked user
  timezone is the dashboard's display timezone for dates/times
  (precedence: user > team > browser > UTC). Wired into the dashboard
  home (`OverviewClient`: chart-axis + tooltip dates, recent-order
  dates, last-sync stamps). Report aggregation boundaries keep the
  existing team/ad-account rules — out of scope for v1; other pages
  still format dates in the browser timezone and are deliberately
  unwired (see "What did NOT change").

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
| Save API | `PATCH /api/user` (`src/app/api/user/route.ts`) | Accepts `displayCurrency` (3-letter code, case-insensitive) and `timezone` (IANA) — both **write-once**: accepted only while unset, otherwise 400 `CURRENCY_LOCKED` / `TIMEZONE_LOCKED` and nothing changes. `null` displayCurrency no longer clears (that would defeat the lock). Also accepts `name`, `phone`, and `onboardingCompleted: true`. Same auth and rate limit as the existing name/phone update; `settings.updated` audit entry. Writes only the signed-in user's own account. |
| Geo endpoint | `GET /api/geo/currency` (`src/app/api/geo/currency/route.ts`) | Reads Vercel's `x-vercel-ip-country` header → `currencyForCountry`. Returns `{ country, currency, source: "vercel-geo" \| "none" }`, `Cache-Control: private, no-store`. **No auth, no DB, no IP stored or logged** — the country code is the only thing that leaves the edge. |
| Country → currency | `src/lib/country-currency.ts` (`currencyForCountry`) | 221 country entries generated from the currency registry's locales plus union overrides (Eurozone → EUR, WAEMU → XOF, CEMAC → XAF, ECCU → XCD, dollarized/shared currencies → USD/AUD/NZD/CHF/GBP/DKK/XPF/NOK). Returns `null` for unknown/invalid codes. Every code in the registry is reachable from at least one country. |
| Browser-language fallback | `src/components/dashboard/CurrencyContext.tsx` | When the geo endpoint returns no currency (local dev, non-Vercel deploys, missing header), the provider derives the region from `navigator.language` (e.g. `en-PK` → `PK` → PKR). |
| Provider | `src/components/dashboard/CurrencyContext.tsx` (`CurrencyProvider`) | One resolution effect combines the five sources with `resolveDisplayCurrency`. The detected value is cached in localStorage (`profit_detected_currency`) separately from the explicit choice (`profit_selected_currency`), so a detection never overwrites a saved preference. The cache is trusted for **24 h** (`DETECTED_CURRENCY_TTL_MS` in `src/lib/geo-detection.ts`): a fresh entry is used without re-fetching, an expired entry — or one written before the TTL existed, which has no timestamp — is re-fetched on the next visit, and is kept only as a fail-open fallback if that re-fetch fails (the stored entry keeps its old timestamp, so the next visit retries). Since the onboarding lock, **nothing writes `profit_selected_currency` any more**: `setCurrency()` is a session-only view pick (in-memory override, `viewOnly: true` while active), never a save. The provider exposes `detectedCurrency`, `viewOnly`, and `resetCurrencyPreference()` (clears the view override and the legacy stored choice). |
| Settings UI | `src/app/(dashboard)/dashboard/settings/SettingsClient.tsx` (Profile tab) + `src/app/(dashboard)/dashboard/settings/page.tsx` | Currency card is **read-only once set** (locked value + "This currency was set during onboarding and cannot be changed"); while unset it offers the searchable selector over the full 148-currency registry, a "Saved preference" line, a "Detected from your location" line (country name via `Intl.DisplayNames`), "Currently showing figures in …", and Save (via `useAsyncAction` + loading `Button`) — the first save locks the choice. No reset ("Use automatic detection") any more. A timezone card shows the locked timezone (read-only) or "Not set yet" until onboarding completes. The Workspace card was removed from Settings (2026-11-13): the saved team currency/timezone remain in the database as fallbacks in the precedence chain, but there is no UI to edit them. |
| Navbar converter | `src/components/dashboard/CurrencySelector.tsx` | Unchanged UI, still global (already on calculator pages). Since the onboarding lock it is **informational only**: picking a currency switches a session-only view currency for reference — it no longer saves the user preference (the old behaviour) and the locked currency returns on reload. Header reads "View currency (reference only)". |
| Team currency page | `src/app/(dashboard)/dashboard/currency/page.tsx` | The display-currency field was removed: nothing writes the workspace display setting any more, so it is now a read-only legacy fallback (the team default for members with no personal preference). Reporting currency, FX source, and manual overrides are unchanged. |
| Workspace settings (GET + model) | `src/app/api/settings/workspace/route.ts`, `src/models/WorkspaceSettings.ts` | **Plan deviation, required for geo to work at all** (see below): the GET now returns the *raw* `displayCurrency` — `null` when the team never chose one — instead of defaulting it to `"USD"` (or to the reporting currency). The Mongoose field no longer has `default: "USD"` for the same reason: a defaulted value is indistinguishable from an explicit choice, and either would block location auto-detect for every team that never picked a currency. Teams that *did* set a display currency keep exactly that value. The PATCH still accepts `displayCurrency`; the reporting-currency fallback now lives in the display precedence itself (below geo), so nothing is lost. |

## What did NOT change

- **Report-base currency** (`report-currency.ts`, `getReportBaseCurrency`): reports are still aggregated in the team's most common store currency. Display conversion happens only at render time.
- **FX pipeline** (`/api/fx/rates`, 60 s refresh, provider chain): untouched.
- **Business logic**: no route, query, or API payload changes beyond the `displayCurrency` field; no copy changes beyond currency UI text.
- **The converter was NOT duplicated** into calculator right rails — one control, one source of truth, in the navbar.

## Guarantees and edge cases

- **Saved never changes by itself.** The only writer of
  `User.displayCurrency` / `User.timezone` is the onboarding modal (first
  set) and the Settings first-save — all explicit user actions, all
  scoped to the signed-in user. The navbar converter writes neither.
- **The lock is server-enforced, not just hidden buttons.** A direct
  `PATCH /api/user` with a locked field returns 400 and changes
  nothing. There is no reset and no admin override in v1.
- **A second team member is unaffected** by your change: the preference lives on the `User` document, not the team workspace setting.
- **Signed out?** The converter still works (in-memory view currency only — nothing is ever POSTed or written to storage for a signed-out visitor) and geo detection still seeds the default; no `/api/user` request is ever made.
- **A cached detection expires after 24 h.** A traveller's default is re-fetched on the next visit once the cached detection is older than a day; entries written before the TTL existed carry no timestamp and count as expired, so they re-fetch on the first visit after this change. If the re-fetch fails, the expired value is used as a fallback rather than nothing (and the next visit retries). The TTL touches the detected default only — a saved preference, team setting, or explicit browser choice still outranks detection and still blocks the geo fetch entirely.
- **Invalid codes are ignored everywhere** (registry-membership check, not just shape): a stale or hand-edited value in any source falls through to the next one.
- **No geo header (local dev)?** The endpoint returns `source: "none"`, and the provider falls back to the browser language, then the store currency, then USD.
- **Privacy:** no IP address is stored or logged anywhere in this feature; the geo endpoint takes no user data and touches no database; the detected country is never logged alongside a user id.
