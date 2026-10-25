import { describe, it, expect } from "vitest";
import {
  buildMessage,
  buildMessageFromRule,
  selectChannels,
  renderTemplate,
  isValidPhoneE164,
  type OrderEvent,
  type NotifyRule,
} from "@/lib/whatsapp";

const base = {
  orderNumber: "#1001",
  customerName: "Ayesha Khan",
  customerPhone: "+923001234567",
  customerEmail: "ayesha@example.com",
  storeName: "Test Store",
};

const ALL_EVENTS: OrderEvent[] = [
  "order_confirmed",
  "order_shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refund_issued",
  "cod_tracking",
];

describe("buildMessage: every event", () => {
  it.each(ALL_EVENTS)("produces whatsapp text, subject and body for %s", (event) => {
    const msg = buildMessage(event, base);
    expect(msg.whatsappText).toContain("#1001");
    expect(msg.whatsappText).toContain("Test Store");
    expect(msg.emailSubject).toContain("#1001");
    expect(msg.emailBody).toContain("#1001");
    expect(msg.whatsappText).not.toContain("undefined");
    expect(msg.emailBody).not.toContain("undefined");
  });

  it("COD tracking text contains tracking id, courier and COD wording", () => {
    const msg = buildMessage("cod_tracking", {
      ...base,
      trackingId: "TRK-98765",
      courier: "TCS",
      amount: 2500,
      currency: "PKR",
    });
    expect(msg.whatsappText).toContain("TRK-98765");
    expect(msg.whatsappText).toContain("TCS");
    expect(msg.whatsappText.toLowerCase()).toContain("cash-on-delivery");
    expect(msg.emailBody).toContain("TRK-98765");
    expect(msg.emailBody).toContain("TCS");
  });

  it("COD tracking works without tracking id/courier but still says COD", () => {
    const msg = buildMessage("cod_tracking", base);
    expect(msg.whatsappText.toLowerCase()).toContain("cash-on-delivery");
    expect(msg.whatsappText).not.toContain("undefined");
  });

  it("cancelled and refund messages never include a tracking id", () => {
    for (const event of ["cancelled", "refund_issued"] as const) {
      const msg = buildMessage(event, {
        ...base,
        trackingId: "TRK-98765",
        courier: "TCS",
      });
      expect(msg.whatsappText).not.toContain("TRK-98765");
      expect(msg.emailBody).not.toContain("TRK-98765");
      expect(msg.emailSubject).not.toContain("TRK-98765");
    }
  });

  it("shipped message includes tracking id and courier when present", () => {
    const msg = buildMessage("order_shipped", {
      ...base,
      trackingId: "TRK-111",
      courier: "DHL",
    });
    expect(msg.whatsappText).toContain("TRK-111");
    expect(msg.whatsappText).toContain("DHL");
  });

  it("throws when orderNumber is missing", () => {
    expect(() => buildMessage("order_confirmed", { ...base, orderNumber: "" })).toThrow(
      /orderNumber/
    );
    expect(() =>
      buildMessage("order_confirmed", { ...base, orderNumber: "   " })
    ).toThrow(/orderNumber/);
  });

  it("throws when storeName is missing", () => {
    expect(() => buildMessage("order_confirmed", { ...base, storeName: "" })).toThrow(
      /storeName/
    );
  });

  it("missing contact details do not throw (routing handles them)", () => {
    const noContacts = {
      orderNumber: base.orderNumber,
      customerName: base.customerName,
      storeName: base.storeName,
    };
    expect(() => buildMessage("order_confirmed", noContacts)).not.toThrow();
  });
});

describe("selectChannels", () => {
  const rule = (event: OrderEvent, channel: NotifyRule["channel"], enabled = true): NotifyRule => ({
    event,
    channel,
    enabled,
  });

  it("'both' degrades to the single available channel", () => {
    const rules = [rule("order_confirmed", "both")];
    expect(selectChannels(rules, "order_confirmed", { whatsapp: true, email: false })).toEqual([
      "whatsapp",
    ]);
    expect(selectChannels(rules, "order_confirmed", { whatsapp: false, email: true })).toEqual([
      "email",
    ]);
    expect(selectChannels(rules, "order_confirmed", { whatsapp: true, email: true })).toEqual([
      "whatsapp",
      "email",
    ]);
  });

  it("returns [] when nothing is available", () => {
    const rules = [rule("order_confirmed", "both")];
    expect(selectChannels(rules, "order_confirmed", { whatsapp: false, email: false })).toEqual([]);
  });

  it("missing contact skips that channel without error", () => {
    const rules = [rule("delivered", "whatsapp")];
    expect(selectChannels(rules, "delivered", { whatsapp: false, email: true })).toEqual([]);
    // Merchant asked for whatsapp only: a present email contact is not substituted.
    expect(selectChannels(rules, "delivered", { whatsapp: true, email: true })).toEqual([
      "whatsapp",
    ]);
  });

  it("disabled rule returns []", () => {
    const rules = [rule("delivered", "both", false)];
    expect(selectChannels(rules, "delivered", { whatsapp: true, email: true })).toEqual([]);
  });

  it("no rule for the event returns []", () => {
    expect(selectChannels([], "delivered", { whatsapp: true, email: true })).toEqual([]);
  });

  it("merchant rule wins: whatsapp-only rule never picks email", () => {
    const rules = [rule("cancelled", "email")];
    expect(selectChannels(rules, "cancelled", { whatsapp: true, email: false })).toEqual([]);
    expect(selectChannels(rules, "cancelled", { whatsapp: true, email: true })).toEqual(["email"]);
  });
});

describe("renderTemplate", () => {
  it("substitutes known keys", () => {
    expect(
      renderTemplate("Hi {{customerName}}, order {{orderNumber}} shipped!", {
        customerName: "Ayesha",
        orderNumber: "#1001",
      })
    ).toBe("Hi Ayesha, order #1001 shipped!");
  });

  it("leaves unknown keys as-is", () => {
    expect(renderTemplate("Code: {{unknown}} and {{orderNumber}}", { orderNumber: "#1" })).toBe(
      "Code: {{unknown}} and #1"
    );
  });

  it("inserts values as plain text without executing code", () => {
    const out = renderTemplate("{{note}}", { note: "{{orderNumber}} ${1+1}" });
    expect(out).toBe("{{orderNumber}} ${1+1}");
  });
});

describe("buildMessageFromRule", () => {
  it("uses custom templates with substitution", () => {
    const msg = buildMessageFromRule(
      {
        event: "delivered",
        channel: "whatsapp",
        enabled: true,
        whatsappTemplate: "Done! {{orderNumber}} from {{storeName}}",
        emailSubject: "Delivered: {{orderNumber}}",
      },
      base
    );
    expect(msg.whatsappText).toBe("Done! #1001 from Test Store");
    expect(msg.emailSubject).toBe("Delivered: #1001");
  });
});

describe("isValidPhoneE164", () => {
  it.each(["+923001234567", "+14155552671", "+442071234567"])(
    "accepts valid E.164 %s",
    (phone) => {
      expect(isValidPhoneE164(phone)).toBe(true);
    }
  );

  it.each(["03001234567", "+012345", "+123", "abc", "", "+", "+92300 1234567"])(
    "rejects invalid %s",
    (phone) => {
      expect(isValidPhoneE164(phone)).toBe(false);
    }
  );

  it("ignores surrounding whitespace", () => {
    expect(isValidPhoneE164("  +923001234567  ")).toBe(true);
  });
});
