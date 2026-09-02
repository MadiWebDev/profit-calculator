import mongoose from "mongoose";
import { validateEnv } from "@/lib/env";

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error("Please define MONGODB_URI in .env.local");
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  envChecked: boolean;
}

// Extend global to cache connection across hot-reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var _mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global._mongoose ?? { conn: null, promise: null, envChecked: false };
if (!global._mongoose) global._mongoose = cached;

export async function connectDB(): Promise<typeof mongoose> {
  // Run env validation once at startup
  if (!cached.envChecked) {
    cached.envChecked = true;
    validateEnv();
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
    };
    cached.promise = mongoose.connect(MONGODB_URI, opts);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}
