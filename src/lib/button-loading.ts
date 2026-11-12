/**
 * Pure logic behind `<Button loading>` — kept in `src/lib` so it can be
 * unit-tested in the node vitest environment (no DOM rendering available).
 *
 * RULES
 *  - While `loading`, the button is disabled (`disabled || loading`) so a
 *    double-click / double-submit cannot happen, and `aria-busy` is true.
 *  - If `loadingText` is passed, the label swaps to it; otherwise the
 *    ORIGINAL label is kept and a spinner is prepended. Never show an
 *    empty label.
 *  - The spinner is shown exactly while `loading` is true.
 */
export interface ButtonLoadingInput {
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  label: string;
}

export interface ButtonLoadingState {
  disabled: boolean;
  ariaBusy: boolean;
  showSpinner: boolean;
  label: string;
}

export function resolveButtonLoadingState({
  loading = false,
  loadingText,
  disabled = false,
  label,
}: ButtonLoadingInput): ButtonLoadingState {
  return {
    disabled: disabled || loading,
    ariaBusy: loading,
    showSpinner: loading,
    label: loading && loadingText ? loadingText : label,
  };
}
