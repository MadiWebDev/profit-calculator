/**
 * Shopify Admin GraphQL client — used for data the REST order sync does
 * not expose cleanly, chiefly variant cost ("cost per item", stored on
 * the variant's inventory item). Order sync itself stays on REST
 * (see docs/DECISIONS.md D4).
 *
 * All calls go through shopifyFetch, so 429/5xx retry, Retry-After and
 * call-limit backoff apply here exactly as they do for REST.
 */
import {
  SHOPIFY_API_VERSION,
  shopifyFetch,
  ShopifyApiError,
} from "@/lib/shopify";
import { logger, toLogError } from "@/lib/logger";

export function graphqlEndpoint(shop: string): string {
  return `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
}

/** Raw GraphQL response envelope. */
export interface GraphqlResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export async function shopifyGraphql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const res = await shopifyFetch(graphqlEndpoint(shop), accessToken, {
    method: "POST",
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as GraphqlResponse<T>;
  if (json.errors?.length) {
    throw new ShopifyApiError(400, `Shopify GraphQL error: ${json.errors.map((e) => e.message).join("; ").slice(0, 300)}`);
  }
  if (!json.data) throw new ShopifyApiError(400, "Shopify GraphQL returned no data");
  return json.data;
}

// ─── Variant costs ──────────────────────────────────────────────────────────

export interface VariantCost {
  variantId: string;
  productId: string;
  sku: string | null;
  cost: number;
}

interface VariantCostPage {
  products: {
    edges: {
      node: {
        id: string;
        variants: {
          edges: {
            node: {
              id: string;
              sku: string | null;
              inventoryItem: { unitCost: { amount: string } | null } | null;
            };
          }[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };
    }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

const VARIANT_COSTS_QUERY = `
  query VariantCosts($cursor: String) {
    products(first: 100, after: $cursor) {
      edges {
        node {
          id
          variants(first: 100) {
            edges {
              node {
                id
                sku
                inventoryItem { unitCost { amount } }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

/** Pure: turn one GraphQL page into variant costs (gid → numeric id). */
export function parseVariantCostsPage(page: VariantCostPage): VariantCost[] {
  const out: VariantCost[] = [];
  const gidToId = (gid: string): string => {
    const parts = gid.split("/");
    return parts[parts.length - 1] ?? gid;
  };
  for (const edge of page.products?.edges ?? []) {
    const productId = gidToId(edge.node.id);
    for (const v of edge.node.variants?.edges ?? []) {
      const amount = v.node.inventoryItem?.unitCost?.amount;
      const cost = amount === undefined ? NaN : parseFloat(amount);
      out.push({
        variantId: gidToId(v.node.id),
        productId,
        sku: v.node.sku ?? null,
        cost: Number.isFinite(cost) ? cost : 0,
      });
    }
  }
  return out;
}

/**
 * Fetch every variant cost for a shop (paginated, best-effort).
 * Throws on API failure — callers that treat this as a fallback must
 * catch and continue with whatever COGS they already have.
 */
export async function fetchVariantCosts(
  shop: string,
  accessToken: string,
  maxPages = 20
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const data: VariantCostPage = await shopifyGraphql<VariantCostPage>(shop, accessToken, VARIANT_COSTS_QUERY, { cursor });
    for (const vc of parseVariantCostsPage(data)) map.set(vc.variantId, vc.cost);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  return map;
}

/** Best-effort wrapper: never throws, returns an empty map on failure. */
export async function fetchVariantCostsSafe(
  shop: string,
  accessToken: string
): Promise<Map<string, number>> {
  try {
    return await fetchVariantCosts(shop, accessToken);
  } catch (e) {
    logger.warn("shopify variant-cost fetch failed (COGS fallback skipped)", {}, toLogError(e));
    return new Map();
  }
}

// ─── Shop info (currency/timezone) ──────────────────────────────────────────

export interface ShopInfo {
  currency: string;
  timezone: string;
  name: string;
}

export async function fetchShopInfo(shop: string, accessToken: string): Promise<ShopInfo> {
  const data = await shopifyGraphql<{ shop: { name: string; currencyCode: string; ianaTimezone: string } }>(
    shop,
    accessToken,
    `query { shop { name currencyCode ianaTimezone } }`
  );
  return {
    name: data.shop.name,
    currency: data.shop.currencyCode,
    timezone: data.shop.ianaTimezone,
  };
}

export { SHOPIFY_API_VERSION };
