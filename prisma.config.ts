// Prisma 7 no longer reads .env automatically inside the config file, and it moved the
// datasource URL out of schema.prisma. Loading dotenv here keeps the documented cold start
// honest: a fresh clone plus `cp .env.example .env` is enough for `prisma migrate deploy`
// and `db:seed` to work, with no extra exported variables (G10).
import "dotenv/config";

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
