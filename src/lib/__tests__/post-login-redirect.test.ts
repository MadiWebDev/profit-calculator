import { describe, it, expect } from "vitest";
import { resolvePostLoginRedirect } from "@/lib/post-login-redirect";

describe("resolvePostLoginRedirect", () => {
  it("sends a superAdmin to /admin when no callbackUrl is given", () => {
    expect(resolvePostLoginRedirect({ role: "superAdmin" })).toBe("/admin");
  });

  it("sends a regular user to /dashboard when no callbackUrl is given", () => {
    expect(resolvePostLoginRedirect({ role: "owner" })).toBe("/dashboard");
  });

  it("defaults to /dashboard when the role is missing or unknown", () => {
    expect(resolvePostLoginRedirect({})).toBe("/dashboard");
    expect(resolvePostLoginRedirect({ role: null })).toBe("/dashboard");
    expect(resolvePostLoginRedirect({ role: undefined })).toBe("/dashboard");
    expect(resolvePostLoginRedirect({ role: "admin" })).toBe("/dashboard");
    expect(resolvePostLoginRedirect({ role: "user" })).toBe("/dashboard");
  });

  it("honors an explicit callbackUrl for a regular user", () => {
    expect(
      resolvePostLoginRedirect({
        role: "owner",
        callbackUrl: "/auth/accept-invite?token=abc",
        hasExplicitCallbackUrl: true,
      })
    ).toBe("/auth/accept-invite?token=abc");
  });

  it("honors an explicit callbackUrl for a superAdmin too", () => {
    expect(
      resolvePostLoginRedirect({
        role: "superAdmin",
        callbackUrl: "/billing",
        hasExplicitCallbackUrl: true,
      })
    ).toBe("/billing");
  });

  it("falls back to the role default when the explicit callbackUrl is empty", () => {
    expect(
      resolvePostLoginRedirect({
        role: "superAdmin",
        callbackUrl: "",
        hasExplicitCallbackUrl: true,
      })
    ).toBe("/admin");
    expect(
      resolvePostLoginRedirect({
        role: "owner",
        callbackUrl: "",
        hasExplicitCallbackUrl: true,
      })
    ).toBe("/dashboard");
  });

  it("ignores a callbackUrl that was not explicitly present", () => {
    expect(
      resolvePostLoginRedirect({
        role: "superAdmin",
        callbackUrl: "/dashboard",
        hasExplicitCallbackUrl: false,
      })
    ).toBe("/admin");
  });
});
