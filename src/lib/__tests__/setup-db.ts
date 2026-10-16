/**
 * Shared mongodb-memory-server setup for DB-backed unit tests.
 *
 * Points the app's own connectDB() at the in-memory server by setting
 * MONGODB_URI before any test calls it (connectDB reads the env lazily
 * and caches the connection).
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import path from "path";
import { connectDB } from "@/lib/db";

let mongod: MongoMemoryServer | null = null;

export async function setupTestDb(): Promise<void> {
  if (mongod) return;
  // mongodb-memory-server defaults its dbPath to os.tmpdir(); on small
  // tmpfs mounts (e.g. 512M) mongod's 500MB free-space check fails, so
  // keep the data dir on disk inside the project (gitignored).
  const dbPath = path.join(process.cwd(), ".mongo-mem");
  mongod = await MongoMemoryServer.create({ instance: { dbPath } });
  process.env.MONGODB_URI = mongod.getUri();
  await connectDB();
}

export async function teardownTestDb(): Promise<void> {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
  delete process.env.MONGODB_URI;
}

export async function clearDb(): Promise<void> {
  if (!mongoose.connection.db) return;
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) {
    await c.deleteMany({});
  }
}
