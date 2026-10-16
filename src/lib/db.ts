import mongoose from "mongoose";
import { validateEnv } from "@/lib/env";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  envChecked: boolean;
}

// Extend global to cache connection across hot-reloads in dev
declare global {
  var _mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global._mongoose ?? { conn: null, promise: null, envChecked: false };
if (!global._mongoose) global._mongoose = cached;

/**
 * Connect to MongoDB (cached). Throws only when actually connecting —
 * never at import time, so `next build` page-data collection doesn't
 * fail when MONGODB_URI is unset in the build environment.
 */
export async function connectDB(): Promise<typeof mongoose> {
  // Run env validation once at startup (skipped in test env)
  if (!cached.envChecked) {
    cached.envChecked = true;
    validateEnv();
  }

  if (cached.conn) return cached.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set — define it in .env.local (development) or your deployment environment."
    );
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
    };
    cached.promise = mongoose.connect(uri, opts);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

/** True when a cached connection is already established. */
export function isDbConnected(): boolean {
  return cached.conn !== null && mongoose.connection.readyState === 1;
}
