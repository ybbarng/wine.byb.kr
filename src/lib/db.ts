import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/generated/wine";

const globalForPrisma = globalThis as unknown as { db: PrismaClient | undefined };

function createClient() {
  const url = process.env.DATABASE_URL ?? "file:./data/wine.db";
  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({ adapter });
}

// 개발 중 HMR로 클라이언트가 여러 개 생기지 않도록 전역에 하나만 둔다.
export const db = globalForPrisma.db ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.db = db;
}
