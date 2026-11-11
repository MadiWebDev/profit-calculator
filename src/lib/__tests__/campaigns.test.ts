import { describe, it, expect, vi, afterEach } from "vitest";
import mongoose from "mongoose";
import {
  buildAudienceFilter,
  capAudience,
  CAMPAIGN_AUDIENCE_CAP,
  defaultSubjectFor,
  escapeHtml,
  firstNameOf,
  isValidWhatsAppTemplateName,
  renderCampaignEmailHtml,
  resolveCampaignSubject,
  UNSUBSCRIBE_FOOTER_TEXT,
  whatsappTemplateBodyParameters,
} from "@/lib/campaigns";
import {
  extractMetaErrorText,
  sendCampaignEmail,
  sendWhatsAppTemplateMessage,
} from "@/lib/campaign-send";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CAMPAIGN_AUDIENCE_CAP", () => {
  it("caps a send at 500 recipients", () => {
    expect(CAMPAIGN_AUDIENCE_CAP).toBe(500);
  });
});

describe("buildAudienceFilter", () => {
  it("all users: empty filter for email", () => {
    expect(buildAudienceFilter({ audienceType: "all", channel: "email" })).toEqual({});
  });

  it("by plan: filters on plan", () => {
    expect(
      buildAudienceFilter({ audienceType: "plan", audiencePlan: "growth", channel: "email" })
    ).toEqual({ plan: "growth" });
  });

  it("by team: filters on teamId as an ObjectId", () => {
    const teamId = new mongoose.Types.ObjectId().toString();
    const filter = buildAudienceFilter({ audienceType: "team", audienceTeamId: teamId, channel: "email" });
    expect(filter.teamId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(filter.teamId.toString()).toBe(teamId);
  });

  it("whatsapp: additionally requires a phone number on file", () => {
    const filter = buildAudienceFilter({ audienceType: "all", channel: "whatsapp" });
    expect(filter.phone).toEqual({ $exists: true, $ne: "" });
  });

  it("whatsapp + plan: combines plan and phone conditions", () => {
    const filter = buildAudienceFilter({ audienceType: "plan", audiencePlan: "pro", channel: "whatsapp" });
    expect(filter.plan).toBe("pro");
    expect(filter.phone).toEqual({ $exists: true, $ne: "" });
  });
});

describe("capAudience", () => {
  it("passes through an audience under the cap untouched", () => {
    const { send, capped } = capAudience([1, 2, 3]);
    expect(send).toEqual([1, 2, 3]);
    expect(capped).toBe(0);
  });

  it("passes through exactly 500 untouched", () => {
    const all = Array.from({ length: 500 }, (_, i) => i);
    const { send, capped } = capAudience(all);
    expect(send).toHaveLength(500);
    expect(capped).toBe(0);
  });

  it("sends the first 500 and reports the overflow when over the cap", () => {
    const all = Array.from({ length: 750 }, (_, i) => i);
    const { send, capped } = capAudience(all);
    expect(send).toHaveLength(500);
    expect(send[499]).toBe(499);
    expect(capped).toBe(250);
  });
});

describe("resolveCampaignSubject", () => {
  it("uses the template type default when no custom subject is given", () => {
    expect(defaultSubjectFor("trial_ending")).toContain("trial");
    expect(resolveCampaignSubject("trial_ending")).toBe(defaultSubjectFor("trial_ending"));
    expect(resolveCampaignSubject("billing_notice", "   ")).toBe(defaultSubjectFor("billing_notice"));
  });

  it("a custom subject wins over the default", () => {
    expect(resolveCampaignSubject("announcement", "Big news!")).toBe("Big news!");
  });

  it("every template type has a non-empty default subject", () => {
    for (const t of ["announcement", "product_update", "trial_ending", "billing_notice", "feature_launch"] as const) {
      expect(defaultSubjectFor(t).length).toBeGreaterThan(0);
    }
  });
});

describe("isValidWhatsAppTemplateName", () => {
  it("accepts Meta-style template names", () => {
    expect(isValidWhatsAppTemplateName("november_launch")).toBe(true);
    expect(isValidWhatsAppTemplateName("promo2026_v2")).toBe(true);
  });

  it("rejects names Meta would reject", () => {
    expect(isValidWhatsAppTemplateName("November Launch")).toBe(false);
    expect(isValidWhatsAppTemplateName("launch-promo")).toBe(false);
    expect(isValidWhatsAppTemplateName("")).toBe(false);
    expect(isValidWhatsAppTemplateName("UPPERCASE")).toBe(false);
  });
});

describe("firstNameOf", () => {
  it("takes the first word, trims whitespace", () => {
    expect(firstNameOf("Ayesha Khan")).toBe("Ayesha");
    expect(firstNameOf("  Bilal  ")).toBe("Bilal");
    expect(firstNameOf("")).toBe("");
  });
});

describe("renderCampaignEmailHtml", () => {
  it("substitutes {{name}}, escapes HTML, and always appends the unsubscribe footer", () => {
    const html = renderCampaignEmailHtml(
      "Hello {{name}}, <script>alert(1)</script>\nSecond line.",
      "Ayesha Khan"
    );
    expect(html).toContain("Ayesha");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<br/>");
    expect(html).toContain(escapeHtml(UNSUBSCRIBE_FOOTER_TEXT));
    expect(html).toContain("Unsubscribe");
  });

  it("leaves unknown placeholders as-is so typos stay visible", () => {
    const html = renderCampaignEmailHtml("Hi {{unknown}}!", "Bilal");
    expect(html).toContain("{{unknown}}");
  });
});

describe("whatsappTemplateBodyParameters", () => {
  it("passes the recipient's first name as {{1}}", () => {
    expect(whatsappTemplateBodyParameters("Ayesha Khan")).toEqual([
      { type: "text", text: "Ayesha" },
    ]);
  });
});

describe("sendCampaignEmail (injected sender — no real send)", () => {
  it("calls the sender with the right to/subject/html payload", async () => {
    const impl = vi.fn().mockResolvedValue(undefined);
    await sendCampaignEmail("user@example.com", "Hello", "<p>Hi</p>", impl);
    expect(impl).toHaveBeenCalledTimes(1);
    const payload = impl.mock.calls[0][0] as { from: string; to: string; subject: string; html: string };
    expect(payload.to).toBe("user@example.com");
    expect(payload.subject).toBe("Hello");
    expect(payload.html).toBe("<p>Hi</p>");
    expect(payload.from.length).toBeGreaterThan(0);
  });

  it("rejects when the sender fails, so the route records a failure", async () => {
    const impl = vi.fn().mockRejectedValue(new Error("Resend boom"));
    await expect(
      sendCampaignEmail("user@example.com", "Hello", "<p>Hi</p>", impl)
    ).rejects.toThrow("Resend boom");
  });
});

describe("extractMetaErrorText", () => {
  it("pulls the message out of a Graph API error body", () => {
    expect(
      extractMetaErrorText(JSON.stringify({ error: { message: "Template not approved", code: 132001 } }))
    ).toBe("Template not approved");
  });

  it("falls back to the raw body when it is not JSON", () => {
    expect(extractMetaErrorText("plain error text")).toBe("plain error text");
  });
});

describe("sendWhatsAppTemplateMessage (mocked fetch — no real send)", () => {
  const setupEnv = () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456789");
  };

  it("posts a template message with the admin-supplied name, language and {{1}} name param", async () => {
    setupEnv();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    const result = await sendWhatsAppTemplateMessage(
      "+923001234567",
      "november_launch",
      "Ayesha Khan",
      fetchMock as unknown as typeof fetch
    );
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/123456789/messages");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    const body = JSON.parse(init.body as string) as {
      messaging_product: string;
      to: string;
      type: string;
      template: { name: string; language: { code: string }; components: unknown[] };
    };
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("+923001234567");
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("november_launch");
    expect(body.template.language.code).toBe("en_US");
    expect(body.template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "Ayesha" }] },
    ]);
  });

  it("surfaces Meta's exact error text when the template is rejected", async () => {
    setupEnv();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({ error: { message: "Template november_launch does not exist", code: 132001 } }),
    });
    const result = await sendWhatsAppTemplateMessage(
      "+923001234567",
      "november_launch",
      "Ayesha Khan",
      fetchMock as unknown as typeof fetch
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Template november_launch does not exist");
    expect(result.error).toContain("400");
  });

  it("reports skipped (not failed) when WhatsApp credentials are missing", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
    const fetchMock = vi.fn();
    const result = await sendWhatsAppTemplateMessage(
      "+923001234567",
      "november_launch",
      "Ayesha Khan",
      fetchMock as unknown as typeof fetch
    );
    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
