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
- Full-section skeletons carry `role="status"` + sr-only "Loading...".
- Dashboard pages: reuse `KpiSkeleton` / `ChartSkeleton` / `TableSkeleton`
  from `DashboardSkeleton.tsx` — they already match the dashboard layout.

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
exists to prevent. Phase 1 wires it into the heavy call sites.

## Accessibility

- Buttons: `aria-busy` while loading; focus preserved.
- Spinners / skeletons: `role="status"` + sr-only "Loading...".
- Errors from `useAsyncAction`: render them with `role="alert"`.
- Reduced motion: `prefers-reduced-motion` disables the spinner spin,
  skeleton pulse, and progress-bar fade (see `globals.css`).
- Never fake progress (no invented percentages for uploads); show real
  state or a determinate spinner.

## Checklist — every new async action or page MUST include a loading state

- [ ] Async action: `useAsyncAction` + `<Button loading>` (or `Spinner`).
- [ ] Data page: skeleton matching the final layout (no blank page,
      no layout jump).
- [ ] New top-level segment: add a `loading.tsx` using `LoadingFallback`.
- [ ] Error path: show the error with `role="alert"`; never swallow it.
- [ ] Reduced motion: no new animation without a `motion-reduce` /
      `prefers-reduced-motion` guard.
- [ ] Timing: reuse the 200 ms / 400 ms constants — never hard-code them.
