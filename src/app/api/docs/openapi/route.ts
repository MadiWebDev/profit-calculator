import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/openapi";

/**
 * GET /api/docs/openapi — serve the public API v1 OpenAPI specification.
 * Public (no auth): the spec itself contains no team data.
 */
export async function GET() {
  return NextResponse.json(openApiSpec, {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
