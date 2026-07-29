import { defineConfig, env } from "prisma/config";

// Prisma 7 moved the datasource URL out of schema.prisma. Migrate reads it from here;
// the client receives it through a driver adapter (see lib/db.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
