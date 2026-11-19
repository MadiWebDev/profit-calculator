import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import {
  buildSendClaimFilter,
  buildSendClaimUpdate,
  SENDABLE_CAMPAIGN_STATUSES,
  summarizeRecipients,
} from "@/lib/campaigns";

describe("SENDABLE_CAMPAIGN_STATUSES", () => {
  it("allows a draft and a failed campaign to be sent, nothing else", () => {
    expect([...SENDABLE_CAMPAIGN_STATUSES]).toEqual(["draft", "failed"]);
  });
});

describe("buildSendClaimFilter", () => {
  it("claims only when the campaign is a draft or failed", () => {
    const id = new mongoose.Types.ObjectId().toString();
    const filter = buildSendClaimFilter(id);
    expect(filter._id).toEqual(new mongoose.Types.ObjectId(id));
    expect(filter.status).toEqual({ $in: ["draft", "failed"] });
  });
});

describe("buildSendClaimUpdate", () => {
  it("flips the status to sending and clears any previous error", () => {
    expect(buildSendClaimUpdate()).toEqual({
      $set: { status: "sending" },
      $unset: { error: "" },
    });
  });
});

describe("summarizeRecipients", () => {
  it("counts outcomes from the recipient array itself", () => {
    expect(
      summarizeRecipients([
        { status: "sent" },
        { status: "sent" },
        { status: "failed" },
        { status: "skipped" },
        { status: "skipped" },
      ])
    ).toEqual({
      targeted: 5,
      sent: 2,
      failed: 1,
      skipped: 2,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      complained: 0,
      read: 0,
      suppressed: 0,
    });
  });

  it("reports zero targeted for an empty array", () => {
    expect(summarizeRecipients([])).toEqual({
      targeted: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      complained: 0,
      read: 0,
      suppressed: 0,
    });
  });

  it("counts webhook-derived statuses", () => {
    expect(
      summarizeRecipients([
        { status: "delivered" },
        { status: "opened" },
        { status: "bounced" },
        { status: "sent" },
      ])
    ).toEqual({
      targeted: 4,
      sent: 1,
      failed: 0,
      skipped: 0,
      delivered: 1,
      opened: 1,
      clicked: 0,
      bounced: 1,
      complained: 0,
      read: 0,
      suppressed: 0,
    });
  });
});
