# Loading patterns

How every async action and page in GetProfitCalc shows loading feedback.
Phase 0 built the reusable system; Phase 1 applies it at every call site.

## The rules

| Rule | Value | Where it lives |
|---|---|---|
| Show delay | ~200 ms — work that finishes faster never shows an indicator | `LOADING_SHOW_DELAY_MS` in `src/lib/loading-timing.ts` |
| Minimum visible time | ~400 ms — once shown, an indicator never strobes off | `LOADING_MIN_VISIBLE_MS` in `src/lib/loading-timing.ts` |
| Never hard-code the numbers | import the constants / state machine from `src/lib/loading-timing.ts` | — |

## Button loading

```tsx
import { Button } from "@/components/ui/button";

<Button loading={saving} loadingText="Saving…">Save changes</Button>
```

- While `loading`, the button shows an inline spinner, is **disabled**
  (double-clicks cannot re-submit), and reports `aria-busy`.
- If `loadingText` is passed the label swaps to it; otherwise the original
  label is kept with the spinner prepended.
- Focus is preserved — the button stays in the DOM.
- A loading button **never auto-submits or retries** on its own. Retries
  are always user-initiated.
- With `asChild` the spinner/label swap cannot be injected; loading only
  disables the button and sets `aria-busy`.

## `useAsyncAction`

```tsx
import { useAsyncAction } from "@/hooks/use-async-action";

const save = useAsyncAction(
  async (values: FormValues) => api.save(values),
  { onError: (err) => toast.error(err.message) },
);

<Button loading={save.loading} onClick={() => save.run(values)}>Save</Button>
{save.error && <p role="alert">{save.error.message}</p>}
```

Returns `{ run, loading, error, data, reset }`.

- `run(...args)` returns the result on success and **rethrows** on
  failure, so the call site can still `catch` it.
- `loading` follows the 200 ms / 400 ms timing rules.
- `error` is the thrown error (normalised to `Error`); `data` is the last
  successful result.
- **Concurrent runs:** a second `run()` while one is in flight returns the
  same in-flight promise and does NOT call the function again — no double
  submits, no duplicate side effects.
- The hook **never shows toasts**. Use `onSuccess` / `onError` in the
  options, or catch the rethrown error, to decide the message.
- The contract (including the state machine) is implemented in
  `src/lib/async-action.ts` and tested in
  `src/lib/__tests__/use-async-action.test.ts`. The hook itself is a thin
  React wrapper; it cannot be rendered in the node vitest environment, so
  its rendering is verified by `tsc` + the production build, not by unit
  tests.

## Spinner

```tsx
import { Spinner } from "@/components/ui/spinner";

<Spinner size="md" />            // sm | md | lg, inherits theme colour
<Spinner size="lg" label="" />  // decorative: no role, no sr-only text
```

`role="status"` + sr-only "Loading..." by default. Respects
`prefers-reduced-motion` (static instead of spinning).

## Skeletons

```tsx
import { CardSkeleton, ListSkeleton, FormSkeleton, ProfileSkeleton, StatsSkeleton } from "@/components/ui/skeleton";
import { KpiSkeleton, ChartSkeleton, TableSkeleton } from "@/components/dashboard/DashboardSkeleton";
```

- Every skeleton reserves the **same space as the final content** (fixed
  heights/widths) so the page does not jump when content arrives.
- **Which skeletons announce:** `ListSkeleton`, `FormSkeleton`,
  `ProfileSkeleton`, `StatsSkeleton` (in `ui/skeleton.tsx`) wrap their
  content in `role="status"` + sr-only "Loading...", so screen readers
  announce them. The primitive `Skeleton` block and `CardSkeleton` stay
  plain (no role) — they are layout blocks, not a status.
- **Dashboard exception (verified Phase 2):** `KpiSkeleton`,
  `ChartSkeleton`, `TableSkeleton` in
  `src/components/dashboard/DashboardSkeleton.tsx` are visual-only —
  they carry **no** `role="status"`. They are the pre-existing
  dashboard blocks Phase 0 reused as-is, so the `(dashboard)`
  `loading.tsx` fallback (KPI + chart + table skeletons) shows a
  pulsing placeholder but announces nothing to screen readers. The
  follow-up fix is one line — a single `role="status"` + sr-only
  "Loading..." on the dashboard variant wrapper in
  `src/components/loading-fallback.tsx` — deliberately **not** done in
  Phase 2 (the phase was docs + verification only); it is a TODO for
  the next loading pass, not a silent gap.

## Route changes

- **Top progress bar** (`src/components/route-progress.tsx`, mounted in
  `Providers`): appears within ~100 ms of clicking an internal link,
  trickles toward 90%, jumps to 100% and fades when the new route renders.
  Built on the existing `ui/progress.tsx` Radix component.
  - Query-only navigations (`?page=2`) do not move the bar — see the
    comment in `route-progress.tsx`. Those are covered by skeletons.
  - Respects `prefers-reduced-motion` (no trickle, no fade).
- **`loading.tsx` per segment** (thin files over
  `src/components/loading-fallback.tsx`, variants `page` / `form` /
  `table` / `dashboard`): root, auth, admin, blog, help, calculators,
  onboarding, pricing, portal, `[locale]`, and `(dashboard)`. Static
  marketing pages are covered by the root `loading.tsx` — do not create
  one per slug page.
  - **Verified live (Phase 2 smoke):** the segment fallback shows when
    *entering* the segment from outside it (e.g. marketing site →
    `/dashboard` — the KPI/chart/table skeletons render while the RSC
    payload is held). Navigating *within* a segment (e.g.
    `/dashboard` → `/dashboard/orders`) shows **no** fallback — React
    keeps the old page visible until the new RSC arrives. That is the
    framework's transition behaviour, not a missing skeleton, and it
    matches the "keep content on refetch" rule below.
- **No `error.tsx` files were added.** Error boundaries change error
  behaviour; if a segment demonstrably needs one, that is a Phase 1
  decision, not a Phase 0 default.

## PageLoader (heavy operations only)

```tsx
import { PageLoader } from "@/components/page-loader";

{redirecting && <PageLoader message="Redirecting to checkout…" />}
```

Full-screen overlay with a spinner + optional message. For **heavy**
operations only — checkout redirects, large imports. Do NOT use it for
ordinary data fetches; that is exactly the failure mode this system
exists to prevent. **Phase 1 did not wire it into any call site, and
that is deliberate, not an oversight:** no heavy operation identified
in the audit needed a full-screen overlay — checkout redirects use
`<Button loading>` in `PricingClient` / `PricingModal`, and the CSV
import uses `<Button loading>` + the determinate upload progress bar.
Wire `PageLoader` in only if a future heavy operation (a long redirect
or a multi-step import) is identified; until then it stays defined but
unused, and the "unused" state is the verified state, not a gap.

## Accessibility

- Buttons: `aria-busy` while loading; focus preserved.
- Spinners: `role="status"` + sr-only "Loading..." (or decorative with
  `label=""` and no role — e.g. the inline search spinner, which is
  visible but not announced).
- Skeletons: `role="status"` + sr-only "Loading..." for the
  `ui/skeleton.tsx` section variants (`List` / `Form` / `Profile` /
  `Stats`); the `DashboardSkeleton` blocks (`Kpi` / `Chart` / `Table`)
  are visual-only — see the note in the Skeletons section above.
- Errors from `useAsyncAction`: render them with `role="alert"`.
- Reduced motion: `prefers-reduced-motion` disables the spinner spin,
  skeleton pulse, and progress-bar fade (see `globals.css`).
- Never fake progress (no invented percentages for uploads); show real
  state or a determinate spinner.

## Phase 1b: data pages, debounced search, uploads, images

### Data pages — skeleton first, keep content on refetch

```tsx
const [data, setData] = useState<Data | null>(null);
const [loading, setLoading] = useState(true);
const firstLoad = loading && data === null;

if (firstLoad) return <StatsSkeleton count={4} />;
if (error) return <Card><CardContent><p role="alert">{error}</p><Button onClick={load}>Retry</Button></CardContent></Card>;
```

- **First load:** skeleton matching the final layout (no blank page).
- **Refetch (filter change, pagination, manual refresh):** keep the
  existing content on screen and show a subtle inline indicator
  (a `Spinner` next to the heading / "Updating…" text). **Never wipe
  content to show a skeleton again.**
- **Error on refetch:** the previous data stays visible under the error
  card; the error is `role="alert"` with a Retry button. Retry calls the
  same `load()` — never `location.reload()`.
- **Empty state stays separate from loading:** empty renders only when
  `!loading && !error && data is empty`.

### Debounced search — one shared hook

```tsx
import { useDebouncedValue, SEARCH_DEBOUNCE_MS } from "@/hooks/use-debounced-value";
// or: import { debounce, SEARCH_DEBOUNCE_MS } from "@/lib/debounce";

const { debouncedValue, isPending, flush } = useDebouncedValue(query);
```

- `SEARCH_DEBOUNCE_MS = 300` (`src/lib/debounce.ts`) — never hard-code a
  delay, never hand-roll a `setTimeout` debounce in a component.
- Fetch / filter on `debouncedValue`, not on the raw input.
- Show a small `Spinner` inside the input while `isPending` so typing
  visibly does something before results arrive.
- On submit (Enter / Search button) call `flush()` first so a keystroke
  in the same tick as the submit is applied at once.
- Pure logic lives in `src/lib/debounce.ts` (trailing-edge `debounce`
  with `.cancel()`, `.flush()`, `.pending`) and is tested in
  `src/lib/__tests__/debounce.test.ts`. The hook is a thin React wrapper
  verified by `tsc` + build, like `useAsyncAction`.

### Uploads — real percentage via XHR, never faked

```tsx
import { uploadWithProgress } from "@/lib/upload-progress";
import { Progress } from "@/components/ui/progress";

const [progress, setProgress] = useState<number | null>(null);
const { ok, status, json } = await uploadWithProgress("/api/orders/import", formData, setProgress);
```

- `fetch()` cannot report upload progress, so uploads with a percentage
  use `uploadWithProgress` (`src/lib/upload-progress.ts`), an XHR POST
  that calls `onProgress(percent)` only when `lengthComputable`.
- **Never fake a percentage.** Render the determinate `<Progress>`
  only when `progress !== null`; before the first progress event show
  the Button loading state + an indeterminate spinner ("Starting
  upload…"). For tiny files the upload may finish before the first
  event — the Button loading state is the whole indicator, by design.
- The percentage covers the file upload only; server-side processing
  afterwards still shows the Button loading state ("Importing…").
- `uploadProgressPercent(loaded, total)`: 0 when total is unknown/≤0 or
  non-finite, clamped 0–100, rounded — tested in
  `src/lib/__tests__/upload-progress.test.ts`. The XHR wrapper itself
  cannot run in the node vitest environment, so it has no unit test.
- Upload progress must never expose file contents or credentials in logs.

### Images — `LoadingImage`

```tsx
import { LoadingImage } from "@/components/ui/loading-image";

<LoadingImage src={cover} alt="…" width={800} height={450} wrapperClassName="h-full w-full" />
```

- Skeleton (`animate-pulse bg-muted`) until the image loads, then a
  fade-in via opacity transition; on error a muted fallback icon with
  `role="img"`. Sizing goes on `wrapperClassName`, not on the image.
- Use for content images: blog covers, product thumbnails, editor
  previews. **Not** for Navbar/Footer logos, and **not** for avatars —
  Radix `AvatarFallback` already shows initials while the image loads.
- Do not touch `next/image` configuration or any image URL logic.

### Icon-only buttons

Where a Button `loading` would crowd the button (icon-only delete /
rotate / refresh buttons), swap the icon for a conditional `<Spinner
size="sm" label="" />` instead and disable the button — same feedback,
no layout change.

## Checklist — every new async action or page MUST include a loading state

- [ ] Async action: `useAsyncAction` + `<Button loading>` (or `Spinner`).
- [ ] Data page: skeleton matching the final layout (no blank page,
      no layout jump).
- [ ] New top-level segment: add a `loading.tsx` using `LoadingFallback`.
- [ ] Error path: show the error with `role="alert"`; never swallow it.
- [ ] Reduced motion: no new animation without a `motion-reduce` /
      `prefers-reduced-motion` guard.
- [ ] Timing: reuse the 200 ms / 400 ms constants — never hard-code them.

### Enforcement — the checklist, not a lint rule

No existing ESLint rule can enforce "no bare async button without
loading": that check would need a custom AST rule that understands
which buttons trigger async work, i.e. a custom ESLint plugin. That
is deliberately **not** built — a custom plugin is out of scope for
this system and would be the wrong kind of enforcement for a
judgement call (a button is not always async; a search form needs a
spinner in the input, not a loading button). The config
(`eslint.config.mjs`) stays on `eslint-config-next` core-web-vitals +
typescript only. Enforcement is this checklist in code review, plus
the patterns above: if a reviewer cannot point at the loading state
for a new async action, the PR is not ready.
