import "./setup-env";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  refreshGoogleAccessToken,
  getValidGoogleToken,
  GoogleTokenError,
} from "@/lib/google-token";
import {
  refreshPinterestAccessToken,
  getValidPinterestToken,
  PinterestTokenError,
} from "@/lib/pinterest-token";
import {
  refreshSnapchatAccessToken,
  getValidSnapchatToken,
  SnapchatTokenError,
} from "@/lib/snapchat-token";
import { encrypt, safeDecrypt } from "@/lib/encryption";

const mockUpdate = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@/models/AdAccount", () => ({
  default: { findByIdAndUpdate: mockUpdate },
}));
vi.mock("@/lib/db", () => ({
  connectDB: vi.fn().mockResolvedValue({}),
}));

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function fakeAccount(over: Record<string, unknown> = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    accessToken: encrypt("old-access-token"),
    refreshToken: encrypt("old-refresh-token"),
    tokenExpiresAt: new Date(Date.now() + 3600_000),
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  mockUpdate.mockClear();
  process.env.GOOGLE_ADS_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_ADS_CLIENT_SECRET = "google-client-secret";
  process.env.PINTEREST_APP_ID = "pin-app-id";
  process.env.PINTEREST_APP_SECRET = "pin-app-secret";
  process.env.SNAPCHAT_CLIENT_ID = "snap-client-id";
  process.env.SNAPCHAT_CLIENT_SECRET = "snap-client-secret";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("refreshGoogleAccessToken (F1)", () => {
  it("exchanges the refresh token for a fresh access token", async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "new-access", expires_in: 3600 })
    );
    const out = await refreshGoogleAccessToken("refresh-123");
    expect(out.accessToken).toBe("new-access");
    expect(out.expiresIn).toBe(3600);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(init.body);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh-123");
    expect(body.get("client_id")).toBe("google-client-id");
  });

  it("throws REFRESH_FAILED on an HTTP error", async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue(jsonResponse({ error: "invalid_grant" }, false, 400));
    await expect(refreshGoogleAccessToken("bad")).rejects.toMatchObject({
      code: "REFRESH_FAILED",
    });
    await expect(refreshGoogleAccessToken("bad")).rejects.toBeInstanceOf(GoogleTokenError);
  });

  it("throws REFRESH_FAILED when the payload carries an error", async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "invalid_grant", error_description: "Token expired" })
    );
    await expect(refreshGoogleAccessToken("bad")).rejects.toThrow(/Token expired/);
  });
});

describe("getValidGoogleToken (F1)", () => {
  it("returns the stored token without fetching when it is still valid", async () => {
    const out = await getValidGoogleToken(fakeAccount());
    expect(out).toBe("old-access-token");
    expect(fetch).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("refreshes and persists the new tokens when expired", async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "fresh-access", refresh_token: "fresh-refresh", expires_in: 3599 })
    );
    const out = await getValidGoogleToken(
      fakeAccount({ tokenExpiresAt: new Date(Date.now() - 1000) })
    );
    expect(out).toBe("fresh-access");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const update = mockUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(safeDecrypt(update.accessToken as string)).toBe("fresh-access");
    // Rotated refresh token must be persisted, not the spent one.
    expect(safeDecrypt(update.refreshToken as string)).toBe("fresh-refresh");
    expect((update.tokenExpiresAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("throws NO_REFRESH_TOKEN when expired with no refresh token (reconnect needed)", async () => {
    await expect(
      getValidGoogleToken(
        fakeAccount({ tokenExpiresAt: new Date(Date.now() - 1000), refreshToken: null })
      )
    ).rejects.toMatchObject({ code: "NO_REFRESH_TOKEN" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("refreshPinterestAccessToken (F3)", () => {
  it("exchanges the refresh token and returns the ROTATED refresh token", async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "pin-new-access", refresh_token: "pinr-new", expires_in: 2592000 })
    );
    const out = await refreshPinterestAccessToken("pinr-old");
    expect(out.accessToken).toBe("pin-new-access");
    expect(out.refreshToken).toBe("pinr-new");
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe("https://api.pinterest.com/v5/oauth/token");
    const body = new URLSearchParams(init.body);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("pinr-old");
    expect(init.headers.Authorization).toMatch(/^Basic /);
  });

  it("throws REFRESH_FAILED on an HTTP error", async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue(jsonResponse({ error: "invalid_grant" }, false, 401));
    await expect(refreshPinterestAccessToken("bad")).rejects.toBeInstanceOf(PinterestTokenError);
  });
});

describe("getValidPinterestToken (F3)", () => {
  it("persists the rotated refresh token — the old one is spent immediately", async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "pin-fresh", refresh_token: "pinr-fresh", expires_in: 2592000 })
    );
    const out = await getValidPinterestToken(
      fakeAccount({ tokenExpiresAt: new Date(Date.now() - 1000) })
    );
    expect(out).toBe("pin-fresh");
    const update = mockUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(safeDecrypt(update.refreshToken as string)).toBe("pinr-fresh");
  });

  it("throws NO_REFRESH_TOKEN when expired with no refresh token", async () => {
    await expect(
      getValidPinterestToken(
        fakeAccount({ tokenExpiresAt: new Date(Date.now() - 1000), refreshToken: null })
      )
    ).rejects.toMatchObject({ code: "NO_REFRESH_TOKEN" });
  });
});

describe("refreshSnapchatAccessToken (F2d)", () => {
  it("exchanges the refresh token for a fresh access token", async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "snap-new-access", expires_in: 3600 })
    );
    const out = await refreshSnapchatAccessToken("snap-refresh-123");
    expect(out.accessToken).toBe("snap-new-access");
    expect(out.expiresIn).toBe(3600);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe("https://accounts.snapchat.com/login/oauth2/access_token");
    const body = new URLSearchParams(init.body);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("snap-refresh-123");
    expect(init.headers.Authorization).toMatch(/^Basic /);
  });

  it("throws REFRESH_FAILED when the payload carries an error", async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "invalid_grant", error_description: "revoked" })
    );
    await expect(refreshSnapchatAccessToken("bad")).rejects.toBeInstanceOf(SnapchatTokenError);
  });
});

describe("getValidSnapchatToken (F2d)", () => {
  it("keeps the stored (non-rotating) refresh token when the endpoint returns none", async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: "snap-fresh", expires_in: 3600 })
    );
    const account = fakeAccount({ tokenExpiresAt: new Date(Date.now() - 1000) });
    const out = await getValidSnapchatToken(account);
    expect(out).toBe("snap-fresh");
    const update = mockUpdate.mock.calls[0][1] as Record<string, unknown>;
    // Snapchat does not rotate: the persisted value is the old token.
    expect(update.refreshToken).toBe(account.refreshToken);
    expect(safeDecrypt(update.accessToken as string)).toBe("snap-fresh");
  });

  it("throws NO_REFRESH_TOKEN when expired with no refresh token (reconnect needed)", async () => {
    await expect(
      getValidSnapchatToken(
        fakeAccount({ tokenExpiresAt: new Date(Date.now() - 1000), refreshToken: null })
      )
    ).rejects.toMatchObject({ code: "NO_REFRESH_TOKEN" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
