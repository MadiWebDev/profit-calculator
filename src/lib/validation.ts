/**
 * Shared Zod validation helpers for API routes.
 *
 * Every mutating route must:
 *   1. authenticate  -> requireAuth() from @/lib/api-helpers
 *   2. authorize     -> team + role checks (Phase 3 permissions)
 *   3. validate      -> parseBody(req, schema) / parseQuery(req, schema)
 *   4. scope queries -> by teamId, never trust client-supplied teamId
 *
 * All schemas use .strict() plus length / array caps.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";

/** Failure envelope used by every API route. Never leaks stacks or secrets. */
export function fail(
  error: string,
  status = 400,
  code?: string
): NextResponse {
  const body: { error: string; code?: string } = { error };
  if (code) body.code = code;
  return NextResponse.json(body, { status });
}

/** ObjectId-as-string schema with a friendly error. */
export const objectIdString = (field = "id") =>
  z
    .string({ error: `${field} is required` })
    .min(1)
    .max(64)
    .refine((v) => mongoose.Types.ObjectId.isValid(v), {
      error: `${field} must be a valid ObjectId`,
    });

/** Common pagination query params. */
export const paginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(50),
  })
  .strict();

/** ISO date range query params. */
export const dateRangeSchema = z
  .object({
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict();

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns { data } on success or { response } (a 400 NextResponse) on failure.
 * Caps body size at 5 MB to bound memory usage.
 */
export async function parseBody<T extends z.ZodType>(
  req: Request,
  schema: T,
  opts: { maxBytes?: number } = {}
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;

  let text: string;
  try {
    text = await req.text();
  } catch {
    return { response: fail("Could not read request body", 400, "BAD_BODY") };
  }
  if (text.length > maxBytes) {
    return { response: fail("Request body too large", 413, "BODY_TOO_LARGE") };
  }

  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    return { response: fail("Invalid JSON body", 400, "BAD_JSON") };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first.path.length ? ` (${first.path.join(".")})` : "";
    return {
      response: fail(`Invalid request${where}: ${first.message}`, 400, "VALIDATION_ERROR"),
    };
  }
  return { data: parsed.data };
}

/**
 * Parse and validate URL query params against a Zod schema.
 * Use z.coerce.* for numbers/booleans since query values are strings.
 */
export function parseQuery<T extends z.ZodType>(
  req: Request,
  schema: T
): { data: z.infer<T> } | { response: NextResponse } {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    obj[k] = v;
  });
  const parsed = schema.safeParse(obj);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first.path.length ? ` (${first.path.join(".")})` : "";
    return {
      response: fail(`Invalid query${where}: ${first.message}`, 400, "VALIDATION_ERROR"),
    };
  }
  return { data: parsed.data };
}

/** Safely convert a validated ObjectId string to a Mongoose ObjectId. */
export function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}
