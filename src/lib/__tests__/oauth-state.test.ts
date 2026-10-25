/**
 * Tests for the OAuth state CSRF nonce helpers (Phase 4).
 * next/headers cookies() is mocked with an in-memory cookie jar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const jar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
    get: (name: string) => {
      const v = jar.get(name);
      return v === undefined ? undefined : { value: v };
    },
    delete: (name: string) => {
      jar.delete(name);
    },
  }),
}));

import { issueOAuthNonce, encodeOAuthState, verifyOAuthState } from "@/lib/oauth-state";

beforeEach(() => {
  jar.clear();
});

describe("oauth-state CSRF nonce", () => {
  it("round-trips: issue → encode → verify returns the payload", async () => {
    const nonce = await issueOAuthNonce("shopify_oauth_nonce");
    const state = encodeOAuthState({ teamId: "abc123" }, nonce);
    const decoded = await verifyOAuthState<{ teamId: string }>("shopify_oauth_nonce", state);
    expect(decoded?.teamId).toBe("abc123");
  });

  it("rejects a state whose nonce does not match the cookie", async () => {
    await issueOAuthNonce("shopify_oauth_nonce");
    const state = encodeOAuthState({ teamId: "abc123" }, "attacker-nonce");
    const decoded = await verifyOAuthState("shopify_oauth_nonce", state);
    expect(decoded).toBeNull();
  });

  it("rejects when the cookie is missing entirely", async () => {
    const state = encodeOAuthState({ teamId: "abc123" }, "some-nonce");
    const decoded = await verifyOAuthState("shopify_oauth_nonce", state);
    expect(decoded).toBeNull();
  });

  it("rejects malformed state", async () => {
    await issueOAuthNonce("shopify_oauth_nonce");
    expect(await verifyOAuthState("shopify_oauth_nonce", "not-base64!!")).toBeNull();
    expect(await verifyOAuthState("shopify_oauth_nonce", null)).toBeNull();
  });

  it("is single-use: the cookie is deleted after verification", async () => {
    const nonce = await issueOAuthNonce("shopify_oauth_nonce");
    const state = encodeOAuthState({ teamId: "abc123" }, nonce);
    expect(await verifyOAuthState("shopify_oauth_nonce", state)).not.toBeNull();
    // Second use fails — replaying the state is rejected
    expect(await verifyOAuthState("shopify_oauth_nonce", state)).toBeNull();
  });

  it("issues unique nonces", async () => {
    const a = await issueOAuthNonce("n1");
    const b = await issueOAuthNonce("n2");
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
  });
});
