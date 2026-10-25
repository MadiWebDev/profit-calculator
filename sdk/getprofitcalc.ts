/**
 * GetProfitCalc Public API v1 — typed JS SDK (F1.10).
 * Usage (Node 18+ / browser):
 *   import { GetProfitCalc } from "./sdk/getprofitcalc";
 *   const api = new GetProfitCalc({ apiKey: "pc_live_..." });
 *   const page = await api.listOrders({ page: 1, limit: 50 });
 * Auth: API key in Authorization: Bearer <redacted>  Write calls accept an
 * optional idempotencyKey, sent as Idempotency-Key (replayed responses
 * are identical for 24h). Errors throw GetProfitCalcError with .status.
 */
export interface Paged<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; pages: number };
}

export interface OrderSummary {
  _id: string;
  orderNumber?: string;
  orderDate: string;
  status: string;
  grossRevenue: number;
  netRevenue: number;
  totalCogs: number;
  netProfit: number;
  profitMargin: number;
  currency: string;
}

export class GetProfitCalcError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "GetProfitCalcError";
  }
}

export class GetProfitCalc {
  constructor(private opts: { apiKey: string; baseUrl?: string }) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const base = (this.opts.baseUrl ?? "https://www.getprofitcalc.com").replace(/\/$/, "");
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.opts.apiKey}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new GetProfitCalcError(res.status, (body as { error?: string }).error ?? `Request failed (${res.status})`);
    return body as T;
  }

  listOrders(params: { page?: number; limit?: number; from?: string; to?: string } = {}): Promise<Paged<OrderSummary>> {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.limit) q.set("limit", String(params.limit));
    if (params.from) q.set("from", params.from);
    if (params.to) q.set("to", params.to);
    const qs = q.toString();
    return this.req<Paged<OrderSummary>>(`/api/v1/orders${qs ? `?${qs}` : ""}`);
  }

  upsertCogs(input: {
    storeId: string; productId: string; productName: string; variantId?: string;
    supplierCost?: number; shippingToWarehouse?: number; importDuties?: number;
    packagingCost?: number; prepCost?: number; otherLandedCost?: number;
  }, idempotencyKey?: string): Promise<{ id: string; cogs: number }> {
    return this.req(`/api/v1/cogs`, {
      method: "POST",
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
      body: JSON.stringify(input),
    });
  }
}
