/**
 * OpenAPI 3.1 specification for the GetProfitCalc public API (v1).
 *
 * Single source of truth, served live at GET /api/docs/openapi.
 * Covers every /api/v1/* route. Authentication is via API key:
 *   Authorization: Bearer <redacted>
 * Keys are created in the dashboard (Settings → API) with granular scopes.
 */
export const OPENAPI_VERSION = "1.0.0";

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "GetProfitCalc Public API",
    version: OPENAPI_VERSION,
    description:
      "Programmatic access to your profit analytics. All endpoints are scoped " +
      "to the team that owns the API key. Money values are in the team's " +
      "currency units (rounded to 2 decimals).",
  },
  servers: [{ url: "https://www.getprofitcalc.com/api/v1" }],
  security: [{ ApiKeyAuth: [] }],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "API key (gpc_…)",
        description: "Create keys in Dashboard → Settings → API. Scopes: read:orders, read:products, read:reports, write:cogs.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
          code: { type: "string" },
        },
      },
      PeriodSummary: {
        type: "object",
        properties: {
          orderCount: { type: "integer" },
          grossRevenue: { type: "number" },
          netRevenue: { type: "number" },
          totalCogs: { type: "number" },
          shippingCost: { type: "number" },
          transactionFees: { type: "number" },
          adSpend: { type: "number" },
          otherCosts: { type: "number" },
          netProfit: { type: "number" },
          netMargin: { type: "number", description: "Percent, 0–100" },
        },
      },
      Order: {
        type: "object",
        properties: {
          id: { type: "string" },
          orderNumber: { type: "string" },
          orderDate: { type: "string", format: "date-time" },
          currency: { type: "string" },
          grossRevenue: { type: "number" },
          netRevenue: { type: "number" },
          totalCogs: { type: "number" },
          status: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/summary": {
      get: {
        summary: "Profit summary for a period",
        description:
          "Aggregated P&L (revenue, costs, net profit, margin) for the team's orders in the period.",
        security: [{ ApiKeyAuth: ["read:reports"] }],
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date-time" }, description: "Start of period (default: 30 days ago)" },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" }, description: "End of period (default: now)" },
        ],
        responses: {
          "200": {
            description: "Period summary",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/PeriodSummary" },
                    period: {
                      type: "object",
                      properties: {
                        from: { type: "string", format: "date-time" },
                        to: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Missing or invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "403": { description: "Key lacks the read:reports scope", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/orders": {
      get: {
        summary: "List orders",
        description: "Paginated orders for the team, newest first.",
        security: [{ ApiKeyAuth: ["read:orders"] }],
        parameters: [
          { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
        ],
        responses: {
          "200": {
            description: "Order list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Order" } },
                    pagination: {
                      type: "object",
                      properties: {
                        page: { type: "integer" },
                        limit: { type: "integer" },
                        total: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Missing or invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "403": { description: "Key lacks the read:orders scope", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/cogs": {
      get: {
        summary: "List COGS rules",
        description: "Current cost-of-goods rules per product/variant.",
        security: [{ ApiKeyAuth: ["read:products"] }],
        responses: {
          "200": { description: "COGS rules", content: { "application/json": { schema: { type: "object" } } } },
          "401": { description: "Missing or invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      post: {
        summary: "Create or update a COGS rule",
        description: "Upserts the landed-cost rule for a product (applies to new orders going forward).",
        security: [{ ApiKeyAuth: ["write:cogs"] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["productId", "cogs"],
                properties: {
                  productId: { type: "string" },
                  variantId: { type: "string" },
                  cogs: { type: "number", minimum: 0 },
                  currency: { type: "string", default: "USD" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Rule saved", content: { "application/json": { schema: { type: "object" } } } },
          "401": { description: "Missing or invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "403": { description: "Key lacks the write:cogs scope", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
  },
} as const;
