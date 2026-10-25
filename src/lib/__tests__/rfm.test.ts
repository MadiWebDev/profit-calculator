import { describe, expect, it } from "vitest";
import { segmentCustomers, type RfmOrderInput } from "@/lib/rfm";

// Fixed "now" so recency math is exact: 2026-10-25T00:00:00Z.
const NOW = new Date("2026-10-25T00:00:00Z");

function order(
  email: string | null | undefined,
  date: string,
  revenue: number,
  profit: number,
  status: RfmOrderInput["status"] = "fulfilled",
): RfmOrderInput {
  return {
    customerEmail: email,
    orderDate: new Date(date),
    netRevenue: revenue,
    netProfit: profit,
    status,
  };
}

function many(
  email: string,
  count: number,
  lastDate: string,
  revenueEach: number,
  profitEach: number,
): RfmOrderInput[] {
  return Array.from({ length: count }, () =>
    order(email, lastDate, revenueEach, profitEach),
  );
}

describe("segmentCustomers", () => {
  it("identifies a champions customer (R/F/M all >= 4)", () => {
    // Quintile hand-check (n = 5):
    // recency asc: champ 5, c2 24, c3 54, c4 85, c5 116 -> R: 5,4,3,2,1
    // orders asc: c2/c4 tied 1 (avg rank 1.5 -> F 1), c3 2 -> 3, c5 3 -> 4, champ 10 -> 5
    // revenue asc: c4 50 -> 1, c2 100 -> 2, c3 300 -> 3, c5 900 -> 4, champ 5000 -> 5
    const orders = [
      ...many("champ@ex.com", 10, "2026-10-20", 500, 200),
      order("c2@ex.com", "2026-10-01", 100, 40),
      ...many("c3@ex.com", 2, "2026-09-01", 150, 60),
      order("c4@ex.com", "2026-08-01", 50, 10),
      ...many("c5@ex.com", 3, "2026-07-01", 300, 120),
    ];
    const { customers, segments } = segmentCustomers(orders, NOW);
    const champ = customers.find((c) => c.email === "champ@ex.com");
    expect(champ).toBeDefined();
    expect(champ!.scoreR).toBe(5);
    expect(champ!.scoreF).toBe(5);
    expect(champ!.scoreM).toBe(5);
    expect(champ!.segment).toBe("champions");
    expect(champ!.orders).toBe(10);
    expect(champ!.totalRevenue).toBe(5000);
    expect(champ!.totalProfit).toBe(2000);
    expect(champ!.avgOrderValue).toBe(500);
    expect(champ!.recencyDays).toBe(5);
    // Segment summary for the whole dataset.
    expect(segments.champions).toEqual({
      count: 1,
      totalRevenue: 5000,
      totalProfit: 2000,
      avgRecencyDays: 5,
    });
    expect(segments.new.count).toBe(1); // c2: 1 order, recency 24
    expect(segments["at-risk"].count).toBe(1); // c5: F 4, recency 116
    expect(segments.regular.count).toBe(2); // c3, c4
    expect(segments.regular.avgRecencyDays).toBe(69.5); // (54 + 85) / 2
    expect(segments.loyal.count).toBe(0);
    expect(segments.lost.count).toBe(0);
  });

  it("identifies a new customer (single order within 30 days)", () => {
    const { customers } = segmentCustomers(
      [
        order("new@ex.com", "2026-10-20", 80, 30),
        order("old@ex.com", "2026-01-05", 80, 30),
        order("mid@ex.com", "2026-05-01", 80, 30),
      ],
      NOW,
    );
    const fresh = customers.find((c) => c.email === "new@ex.com");
    expect(fresh!.orders).toBe(1);
    expect(fresh!.recencyDays).toBe(5);
    expect(fresh!.segment).toBe("new");
  });

  it("identifies an at-risk customer (frequent but quiet for > 90 days)", () => {
    const { customers } = segmentCustomers(
      [
        ...many("risk@ex.com", 4, "2026-06-27", 100, 40),
        order("x@ex.com", "2026-10-15", 100, 40),
        ...many("y@ex.com", 2, "2026-10-05", 100, 40),
        order("z@ex.com", "2026-10-20", 50, 20),
      ],
      NOW,
    );
    const risk = customers.find((c) => c.email === "risk@ex.com");
    expect(risk!.recencyDays).toBe(120);
    expect(risk!.scoreF).toBe(5);
    expect(risk!.segment).toBe("at-risk");
  });

  it("identifies a lost customer (quiet for > 180 days, not at-risk)", () => {
    const { customers } = segmentCustomers(
      [
        order("lost@ex.com", "2026-01-01", 100, 40),
        ...many("a@ex.com", 5, "2026-10-20", 100, 40),
        ...many("b@ex.com", 3, "2026-10-15", 100, 40),
        ...many("c@ex.com", 2, "2026-10-05", 100, 40),
      ],
      NOW,
    );
    const lost = customers.find((c) => c.email === "lost@ex.com");
    expect(lost!.recencyDays).toBe(297);
    expect(lost!.scoreF).toBe(1); // below the at-risk F >= 3 bar
    expect(lost!.segment).toBe("lost");
  });

  it("resolves loyal before at-risk when both apply (documented precedence)", () => {
    // loyalish: most recent (R 5), most orders (F 5), smallest revenue (M 1).
    // It qualifies for at-risk (F >= 3, recency 100 > 90) AND loyal
    // (F >= 4, R >= 3); precedence champions > loyal > new > at-risk
    // > lost > regular makes it loyal.
    const { customers } = segmentCustomers(
      [
        ...many("loyalish@ex.com", 6, "2026-07-17", 10, 4),
        order("o1@ex.com", "2026-01-01", 1000, 400),
        order("o2@ex.com", "2026-02-01", 800, 320),
        ...many("o3@ex.com", 2, "2026-03-01", 250, 100),
        order("o4@ex.com", "2026-04-01", 200, 80),
      ],
      NOW,
    );
    const loyalish = customers.find((c) => c.email === "loyalish@ex.com");
    expect(loyalish!.scoreF).toBe(5);
    expect(loyalish!.scoreR).toBe(5);
    expect(loyalish!.recencyDays).toBe(100);
    expect(loyalish!.segment).toBe("loyal");
  });

  it("excludes cancelled orders and skips missing/blank emails", () => {
    const { customers } = segmentCustomers(
      [
        order("keep@ex.com", "2026-10-20", 100, 40),
        order("keep@ex.com", "2026-10-21", 999, 999, "cancelled"),
        order(null, "2026-10-20", 500, 500),
        order("   ", "2026-10-20", 500, 500),
        order(undefined, "2026-10-20", 500, 500),
      ],
      NOW,
    );
    expect(customers).toHaveLength(1);
    expect(customers[0].email).toBe("keep@ex.com");
    expect(customers[0].orders).toBe(1);
    expect(customers[0].totalRevenue).toBe(100);
    expect(customers[0].totalProfit).toBe(40);
  });

  it("gives a single customer all scores of 3", () => {
    const { customers } = segmentCustomers(
      many("solo@ex.com", 2, "2026-10-15", 100, 40),
      NOW,
    );
    expect(customers).toHaveLength(1);
    expect(customers[0].scoreR).toBe(3);
    expect(customers[0].scoreF).toBe(3);
    expect(customers[0].scoreM).toBe(3);
    expect(customers[0].segment).toBe("regular");
  });

  it("returns empty customers and a zeroed segment summary for empty input", () => {
    const { customers, segments } = segmentCustomers([], NOW);
    expect(customers).toEqual([]);
    for (const key of [
      "champions",
      "loyal",
      "new",
      "at-risk",
      "lost",
      "regular",
    ] as const) {
      expect(segments[key]).toEqual({
        count: 0,
        totalRevenue: 0,
        totalProfit: 0,
        avgRecencyDays: 0,
      });
    }
  });

  it("merges emails case-insensitively and ignores surrounding whitespace", () => {
    const { customers } = segmentCustomers(
      [
        order("Alice@Example.com", "2026-10-01", 100, 40),
        order("  alice@example.com  ", "2026-10-20", 200, 80),
      ],
      NOW,
    );
    expect(customers).toHaveLength(1);
    expect(customers[0].email).toBe("alice@example.com");
    expect(customers[0].orders).toBe(2);
    expect(customers[0].totalRevenue).toBe(300);
    expect(customers[0].firstOrderDate).toEqual(new Date("2026-10-01"));
    expect(customers[0].lastOrderDate).toEqual(new Date("2026-10-20"));
  });

  it("sorts customers by totalProfit desc", () => {
    const { customers } = segmentCustomers(
      [
        order("low@ex.com", "2026-10-20", 100, 10),
        order("high@ex.com", "2026-10-20", 100, 90),
        order("mid@ex.com", "2026-10-20", 100, 50),
      ],
      NOW,
    );
    expect(customers.map((c) => c.email)).toEqual([
      "high@ex.com",
      "mid@ex.com",
      "low@ex.com",
    ]);
  });

  it("floors recency at 0 for partial days and future last orders", () => {
    const { customers } = segmentCustomers(
      [
        order("partial@ex.com", "2026-10-24T23:00:00Z", 100, 40),
        order("future@ex.com", "2026-11-01T00:00:00Z", 100, 40),
      ],
      new Date("2026-10-25T12:00:00Z"),
    );
    expect(
      customers.find((c) => c.email === "partial@ex.com")!.recencyDays,
    ).toBe(0); // 13 hours -> 0 whole days
    expect(
      customers.find((c) => c.email === "future@ex.com")!.recencyDays,
    ).toBe(0); // future dates never go negative
  });

  it("rounds money to 2dp and coerces non-finite inputs to 0", () => {
    const { customers } = segmentCustomers(
      [
        order("money@ex.com", "2026-10-20", 19.99, 10.006),
        order("money@ex.com", "2026-10-21", 0.01, 0.004),
        order("bad@ex.com", "2026-10-20", Number.NaN, Number.POSITIVE_INFINITY),
      ],
      NOW,
    );
    const money = customers.find((c) => c.email === "money@ex.com")!;
    expect(money.totalRevenue).toBe(20);
    expect(money.totalProfit).toBe(10.01); // 10.006 + 0.004 -> 10.01
    expect(money.avgOrderValue).toBe(10);
    const bad = customers.find((c) => c.email === "bad@ex.com")!;
    expect(bad.totalRevenue).toBe(0);
    expect(bad.totalProfit).toBe(0);
  });

  it("gives tied customers the same score (average-rank ties)", () => {
    const { customers } = segmentCustomers(
      [
        order("a@ex.com", "2026-10-20", 100, 40),
        order("b@ex.com", "2026-10-20", 100, 40),
        order("c@ex.com", "2026-10-20", 100, 40),
      ],
      NOW,
    );
    // All three tie on every metric: identical scores across the board.
    expect(customers[0].scoreR).toBe(customers[1].scoreR);
    expect(customers[0].scoreF).toBe(customers[1].scoreF);
    expect(customers[0].scoreM).toBe(customers[1].scoreM);
    expect(customers[0].scoreF).toBe(3); // avg rank 2 of 3 -> p 0.5 -> 1 + 2
  });
});
