import { describe, it, expect } from "vitest";
import { resolveButtonLoadingState } from "@/lib/button-loading";

describe("resolveButtonLoadingState", () => {
  it("idle button: enabled, not busy, no spinner, original label", () => {
    expect(resolveButtonLoadingState({ label: "Save" })).toEqual({
      disabled: false,
      ariaBusy: false,
      showSpinner: false,
      label: "Save",
    });
  });

  it("loading button: disabled, busy, spinner, original label kept", () => {
    expect(resolveButtonLoadingState({ loading: true, label: "Save" })).toEqual({
      disabled: true,
      ariaBusy: true,
      showSpinner: true,
      label: "Save",
    });
  });

  it("loading with loadingText: label swaps to the loading text", () => {
    expect(
      resolveButtonLoadingState({ loading: true, loadingText: "Saving…", label: "Save" }),
    ).toEqual({
      disabled: true,
      ariaBusy: true,
      showSpinner: true,
      label: "Saving…",
    });
  });

  it("loadingText is ignored when not loading", () => {
    expect(
      resolveButtonLoadingState({ loading: false, loadingText: "Saving…", label: "Save" }),
    ).toEqual({
      disabled: false,
      ariaBusy: false,
      showSpinner: false,
      label: "Save",
    });
  });

  it("an already-disabled button stays disabled and keeps its label", () => {
    expect(resolveButtonLoadingState({ disabled: true, label: "Save" })).toEqual({
      disabled: true,
      ariaBusy: false,
      showSpinner: false,
      label: "Save",
    });
  });
});
