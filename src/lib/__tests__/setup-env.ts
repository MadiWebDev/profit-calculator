/**
 * Test-env bootstrap — imported FIRST by DB/encryption tests.
 * ES module evaluation follows source order, so importing this before any
 * app module guarantees the env vars are set before @/lib/encryption
 * captures ENCRYPTION_KEY at import time.
 */
process.env.ENCRYPTION_KEY ??= "0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.NEXT_PUBLIC_SITE_URL ??= "http://localhost:3000";
