import { describe, it, expect } from "vitest";
import {
  MESSAGE_EVENT_TYPES,
  MESSAGE_EVENT_TRANSITIONS,
  isValidMessageEventTransition,
} from "@/lib/message-events";

describe("MESSAGE_EVENT_TYPES", () => {
  it("covers every delivery stage the providers can report", () => {
    expect(MESSAGE_EVENT_TYPES).toEqual(
      expect.arrayContaining(["sent", "delivered", "opened", "clicked", "bounced", "complained", "failed", "read", "suppressed"])
    );
  });

  it("has a transition row for every event type", () => {
    for (const t of MESSAGE_EVENT_TYPES) {
      expect(MESSAGE_EVENT_TRANSITIONS[t]).toBeDefined();
    }
  });
});

describe("isValidMessageEventTransition", () => {
  it("allows the real email funnel: sent → delivered → opened → clicked", () => {
    expect(isValidMessageEventTransition("sent", "delivered")).toBe(true);
    expect(isValidMessageEventTransition("delivered", "opened")).toBe(true);
    expect(isValidMessageEventTransition("opened", "clicked")).toBe(true);
  });

  it("allows the real WhatsApp funnel: sent → delivered → read", () => {
    expect(isValidMessageEventTransition("sent", "delivered")).toBe(true);
    expect(isValidMessageEventTransition("delivered", "read")).toBe(true);
  });

  it("allows a hard bounce straight from sent, and a complaint from delivered/opened/clicked", () => {
    expect(isValidMessageEventTransition("sent", "bounced")).toBe(true);
    expect(isValidMessageEventTransition("delivered", "complained")).toBe(true);
    expect(isValidMessageEventTransition("opened", "complained")).toBe(true);
    expect(isValidMessageEventTransition("clicked", "complained")).toBe(true);
  });

  it("allows a suppression to arrive at any point before a terminal state", () => {
    expect(isValidMessageEventTransition("sent", "suppressed")).toBe(true);
    expect(isValidMessageEventTransition("delivered", "suppressed")).toBe(true);
    expect(isValidMessageEventTransition("opened", "suppressed")).toBe(true);
  });

  it("never allows a status to move backwards or repeat itself", () => {
    expect(isValidMessageEventTransition("delivered", "sent")).toBe(false);
    expect(isValidMessageEventTransition("opened", "delivered")).toBe(false);
    expect(isValidMessageEventTransition("clicked", "opened")).toBe(false);
    expect(isValidMessageEventTransition("read", "delivered")).toBe(false);
    expect(isValidMessageEventTransition("sent", "sent")).toBe(false);
    expect(isValidMessageEventTransition("delivered", "delivered")).toBe(false);
  });

  it("treats bounced, complained, failed, read and suppressed as terminal", () => {
    for (const terminal of ["bounced", "complained", "failed", "read", "suppressed"] as const) {
      for (const next of MESSAGE_EVENT_TYPES) {
        expect(isValidMessageEventTransition(terminal, next)).toBe(false);
      }
    }
  });
});
