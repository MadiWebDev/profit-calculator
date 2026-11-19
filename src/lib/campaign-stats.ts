/**
 * Campaign Center stats (Phase 3) — pure helpers for the Overview KPIs,
 * the Analytics charts, and the stats API route. Everything here works
 * on plain data, so it is unit-testable without a database; the route
 * does the Mongo aggregations and calls these.
 *
 * Honesty rules (from the audit): a rate is `null` — never 0 — when its
 * denominator is zero, and the UI renders null as "Tracking unavailable".
 * A campaign counts in a range by its *activity* date: `sentAt` when it
 * was sent, `createdAt` while it is still a draft.
 */


export type CampaignDateRangeKey =
  | "today"
  | "7d"
  | "30d"
  | "90d"
  | "this-month"
  | "last-month"
  | "custom"
  | "all";

export const DATE_RANGE_LABELS: Record<CampaignDateRangeKey, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "this-month": "This month",
  "last-month": "Last month",
  custom: "Custom",
  all: "All time",
};

/** Half-open range [from, to) in UTC. `null` = all time (no filtering). */
export type DateRange = { from: Date; to: Date } | null;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

/**
 * Resolve a range key to a half-open UTC range. `custom` needs both
 * dates (inclusive days); anything invalid falls back to "30d" so the
 * caller always gets a usable range — the API route validates custom
 * input separately and answers 400 before this is called.
 */
export function resolveDateRange(
  range: CampaignDateRangeKey,
  now: Date,
  customFrom?: string,
  customTo?: string
): DateRange {
  const today = startOfUtcDay(now);
  switch (range) {
    case "all":
      return null;
    case "today":
      return { from: today, to: addUtcDays(today, 1) };
    case "7d":
      return { from: addUtcDays(today, -6), to: addUtcDays(today, 1) };
    case "30d":
      return { from: addUtcDays(today, -29), to: addUtcDays(today, 1) };
    case "90d":
      return { from: addUtcDays(today, -89), to: addUtcDays(today, 1) };
    case "this-month":
      return {
        from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
      };
    case "last-month":
      return {
        from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
        to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      };
    case "custom": {
      const from = customFrom ? startOfUtcDay(new Date(customFrom)) : null;
      const to = customTo ? addUtcDays(startOfUtcDay(new Date(customTo)), 1) : null;
      if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
        return resolveDateRange("30d", now);
      }
      return { from, to };
    }
  }
}

/** "2026-11-19" in UTC. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Every day key in [from, to), in order. Capped at 366 days. */
export function daysInRange(from: Date, to: Date): string[] {
  const days: string[] = [];
  let d = startOfUtcDay(from);
  const end = startOfUtcDay(to);
  while (d < end && days.length < 366) {
    days.push(dayKey(d));
    d = addUtcDays(d, 1);
  }
  return days;
}

export interface CampaignStatsRow {
  channel: "email" | "whatsapp";
  templateType: string;
  audienceType: string;
  audiencePlan?: string | null;
  status: string;
  sentAt: Date | string | null;
  createdAt: Date | string;
  stats: {
    targeted: number;
    sent: number;
    failed: number;
    skipped: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    read: number;
    suppressed: number;
  };
}

export interface CampaignKpis {
  campaignsTotal: number;
  campaignsSent: number;
  campaignsDraft: number;
  campaignsFailed: number;
  targeted: number;
  sent: number;
  delivered: number;
  failed: number;
  skipped: number;
  bounced: number;
  complained: number;
  opened: number;
  clicked: number;
  read: number;
  /** delivered / sent (provider-accepted). null when nothing was sent. */
  deliveryRate: number | null;
  /** opened / delivered. null when nothing was delivered. */
  openRate: number | null;
  /** clicked / delivered. null when nothing was delivered. */
  clickRate: number | null;
  /** read / WhatsApp-delivered. null when nothing was delivered on WhatsApp. */
  readRate: number | null;
  /** Entries on the suppression list (the one honest "unsubscribed" count). */
  unsubscribed: number;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** Sum the stats of in-range campaign rows into the Overview KPIs. */
export function computeKpis(rows: CampaignStatsRow[], unsubscribed: number): CampaignKpis {
  const k: CampaignKpis = {
    campaignsTotal: rows.length,
    campaignsSent: 0,
    campaignsDraft: 0,
    campaignsFailed: 0,
    targeted: 0,
    sent: 0,
    delivered: 0,
    failed: 0,
    skipped: 0,
    bounced: 0,
    complained: 0,
    opened: 0,
    clicked: 0,
    read: 0,
    deliveryRate: null,
    openRate: null,
    clickRate: null,
    readRate: null,
    unsubscribed,
  };
  let deliveredWhatsapp = 0;
  for (const r of rows) {
    if (r.status === "sent") k.campaignsSent += 1;
    if (r.status === "draft") k.campaignsDraft += 1;
    if (r.status === "failed") k.campaignsFailed += 1;
    const s = r.stats;
    k.targeted += s.targeted;
    k.sent += s.sent;
    k.delivered += s.delivered;
    k.failed += s.failed;
    k.skipped += s.skipped;
    k.bounced += s.bounced;
    k.complained += s.complained;
    k.opened += s.opened;
    k.clicked += s.clicked;
    k.read += s.read;
    if (r.channel === "whatsapp") deliveredWhatsapp += s.delivered;
  }
  k.deliveryRate = rate(k.delivered, k.sent);
  k.openRate = rate(k.opened, k.delivered);
  k.clickRate = rate(k.clicked, k.delivered);
  k.readRate = rate(k.read, deliveredWhatsapp);
  return k;
}

export interface DailyPoint {
  date: string;
  sent: number;
  delivered: number;
  failed: number;
  opened: number;
  clicked: number;
  read: number;
  bounced: number;
}

/** One (day, recipient status) bucket from the Campaign recipients aggregation. */
export interface RecipientDayBucket {
  date: string;
  status: string;
  count: number;
}

/** One (day, event type) bucket from the MessageEvent aggregation. */
export interface EventDayBucket {
  date: string;
  eventType: string;
  count: number;
}

/**
 * Merge the two daily aggregations into a gapless series. A recipient
 * counts as "sent" on its sentAt day whatever its current status is
 * (delivered/opened/… all imply it was sent); "failed"/"skipped" are
 * their own series. Days with no activity still appear (zeros), so the
 * chart never has gaps.
 */
export function buildDailySeries(
  range: DateRange,
  recipientDays: RecipientDayBucket[],
  eventDays: EventDayBucket[]
): DailyPoint[] {
  if (!range) return [];
  const points = new Map<string, DailyPoint>();
  for (const date of daysInRange(range.from, range.to)) {
    points.set(date, {
      date,
      sent: 0,
      delivered: 0,
      failed: 0,
      opened: 0,
      clicked: 0,
      read: 0,
      bounced: 0,
    });
  }
  for (const b of recipientDays) {
    const p = points.get(b.date);
    if (!p) continue;
    if (b.status === "failed") p.failed += b.count;
    else if (b.status === "skipped") continue; // skipped is not a send
    else p.sent += b.count;
  }
  for (const b of eventDays) {
    const p = points.get(b.date);
    if (!p) continue;
    if (b.eventType === "delivered") p.delivered += b.count;
    else if (b.eventType === "opened") p.opened += b.count;
    else if (b.eventType === "clicked") p.clicked += b.count;
    else if (b.eventType === "read") p.read += b.count;
    else if (b.eventType === "bounced") p.bounced += b.count;
  }
  return [...points.values()];
}

export interface BreakdownRow {
  key: string;
  label: string;
  campaigns: number;
  targeted: number;
  sent: number;
  delivered: number;
  deliveryRate: number | null;
}

function breakdown(
  rows: CampaignStatsRow[],
  keyOf: (r: CampaignStatsRow) => { key: string; label: string }
): BreakdownRow[] {
  const map = new Map<string, BreakdownRow & { label: string }>();
  for (const r of rows) {
    const { key, label } = keyOf(r);
    let row = map.get(key);
    if (!row) {
      row = { key, label, campaigns: 0, targeted: 0, sent: 0, delivered: 0, deliveryRate: null };
      map.set(key, row);
    }
    row.campaigns += 1;
    row.targeted += r.stats.targeted;
    row.sent += r.stats.sent;
    row.delivered += r.stats.delivered;
  }
  return [...map.values()]
    .map((r) => ({ ...r, deliveryRate: rate(r.delivered, r.sent) }))
    .sort((a, b) => b.sent - a.sent);
}

export const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  announcement: "Announcement",
  product_update: "Product update",
  trial_ending: "Trial ending",
  billing_notice: "Billing notice",
  feature_launch: "Feature launch",
};

export function computeChannelBreakdown(rows: CampaignStatsRow[]): BreakdownRow[] {
  return breakdown(rows, (r) => ({
    key: r.channel,
    label: r.channel === "email" ? "Email" : "WhatsApp",
  }));
}

export function computeTypeBreakdown(rows: CampaignStatsRow[]): BreakdownRow[] {
  return breakdown(rows, (r) => ({
    key: r.templateType,
    label: TEMPLATE_TYPE_LABELS[r.templateType] ?? r.templateType,
  }));
}

/**
 * Performance by audience plan. Only plan-audience campaigns have a
 * plan; everything else lands in the honestly-labelled "mixed" bucket
 * instead of being silently dropped or misattributed.
 */
export function computePlanBreakdown(rows: CampaignStatsRow[]): BreakdownRow[] {
  return breakdown(rows, (r) =>
    r.audienceType === "plan" && r.audiencePlan
      ? { key: r.audiencePlan, label: r.audiencePlan }
      : { key: "mixed", label: "Mixed audience" }
  );
}

export interface CampaignCenterStats {
  kpis: CampaignKpis;
  daily: DailyPoint[];
  byChannel: BreakdownRow[];
  byType: BreakdownRow[];
  byPlan: BreakdownRow[];
  hasTracking: boolean;
}
