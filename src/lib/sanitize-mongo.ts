/**
 * NoSQL injection sanitizer (R5). Strips MongoDB operator keys ($ne, $gt,
 * $where, …) and dotted keys from any user-supplied object before it
 * reaches a Mongoose query. Applied recursively; arrays are preserved.
 * Never mutate the caller's object — returns a cleaned copy.
 */
const OPERATOR = /^\$/;

export function sanitizeMongo<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((v) => sanitizeMongo(v)) as T;
  }
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (OPERATOR.test(k) || k.includes(".")) continue;
      out[k] = sanitizeMongo(v);
    }
    return out as T;
  }
  return input;
}

/** True if the value contains any operator/dotted key (for tests / audits). */
export function containsMongoOperator(input: unknown): boolean {
  if (Array.isArray(input)) return input.some(containsMongoOperator);
  if (input && typeof input === "object") {
    return Object.entries(input as Record<string, unknown>).some(
      ([k, v]) => OPERATOR.test(k) || k.includes(".") || containsMongoOperator(v),
    );
  }
  return false;
}
