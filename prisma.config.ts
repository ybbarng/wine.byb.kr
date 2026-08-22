import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7부터 datasource 연결 URL은 스키마가 아니라 여기(마이그레이션·db push용)에 둔다.
// 런타임 연결은 src/lib/db.ts 의 libsql 어댑터가 담당한다.
// .env 자동 로딩에 기대지 않도록 기본값(data/wine.db)을 함께 둔다.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./data/wine.db",
  },
});
