// Provider-timeout tests — a stalled provider call must fail the
// recipient after PROVIDER_TIMEOUT_MS instead of hanging the send
// batch forever. No real provider is ever called: the Resend client
// is module-mocked and the WhatsApp fetch is injected.
//
// NOTE: these tests use REAL timers. Node's AbortSignal.timeout runs
// on an internal timer that fake timers do not drive (verified:
// the fake-timer version hung), so the three timing tests wait the
// real 30s — marked concurrent so the file costs ~31s, not ~90s.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const captured = vi.hoisted(() => ({
  resendSignals: [] as (AbortSignal | undefined)[],
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: (_payload: unknown, options?: { signal?: AbortSignal }) => {
        captured.resendSignals.push(options?.signal);
        // Hangs until the passed signal aborts — the exact behaviour
        // of a stalled socket.
        return new Promise((_resolve, reject) => {
          const signal = options?.signal;
          if (!signal) return; // never settles without a signal
          signal.addEventListener(
            "abort",
            () => reject(signal.reason ?? new Error("aborted")),
            { once: true }
          );
        });
      },
    };
  },
}));

import {
  sendCampaignEmail,
  sendWhatsAppTemplateMessage,
  providerTimeoutSignal,
  PROVIDER_TIMEOUT_MS,
} from "@/lib/campaign-send";

/** Wait just past the timeout so the abort has fired. */
const waitPastTimeout = () =>
  new Promise((resolve) => setTimeout(resolve, PROVIDER_TIMEOUT_MS + 1000));

function hangingFetch(signalHolder: { signal?: AbortSignal }) {
  return vi.fn(
    (_url: string, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal ?? null;
        signalHolder.signal = signal ?? undefined;
        if (!signal) return; // never settles without a signal
        signal.addEventListener(
          "abort",
          () =>
            reject(
              signal.reason ??
                new DOMException("The operation timed out.", "TimeoutError")
            ),
          { once: true }
        );
      })
  );
}

describe("providerTimeoutSignal", () => {
  // 45s: the test waits the real 31s for the signal to fire, past
  // vitest's 30s default test timeout.
  it.concurrent(
    "aborts after PROVIDER_TIMEOUT_MS",
    async () => {
      expect(PROVIDER_TIMEOUT_MS).toBe(30_000);
      const signal = providerTimeoutSignal();
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
      await waitPastTimeout();
      expect(signal.aborted).toBe(true);
      expect((signal.reason as Error)?.name).toBe("TimeoutError");
    },
    45_000
  );
});

describe("Resend timeout", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_timeout");
    captured.resendSignals.length = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.concurrent(
    "passes an abort signal to the Resend send and fails on timeout",
    async () => {
      const promise = sendCampaignEmail("a@example.com", "subject", "<p>hi</p>");
      const assertion = expect(promise).rejects.toThrow(/timed? ?out/i);
      expect(captured.resendSignals[0]).toBeInstanceOf(AbortSignal);
      await waitPastTimeout();
      await assertion;
    },
    45_000
  );
});

describe("WhatsApp timeout", () => {
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456789");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.concurrent(
    "passes an abort signal to the Graph fetch and fails the recipient on timeout",
    async () => {
      const holder: { signal?: AbortSignal } = {};
      const fetchImpl = hangingFetch(holder);
      const promise = sendWhatsAppTemplateMessage(
        "+1234567890",
        "hello_world",
        "Aisha",
        fetchImpl as unknown as typeof fetch
      );
      const assertion = expect(promise).resolves.toEqual({
        ok: false,
        error: expect.stringMatching(/timed? ?out/i),
      });
      expect(holder.signal).toBeInstanceOf(AbortSignal);
      await waitPastTimeout();
      await assertion;
    },
    45_000
  );

  it("records a timeout error, not a hang, when the provider never answers", async () => {
    const fetchImpl = vi.fn(
      (): Promise<Response> =>
        Promise.reject(new DOMException("The operation timed out.", "TimeoutError"))
    );
    const result = await sendWhatsAppTemplateMessage(
      "+1234567890",
      "hello_world",
      "Aisha",
      fetchImpl as unknown as typeof fetch
    );
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/timed? ?out/i) });
  });
});
