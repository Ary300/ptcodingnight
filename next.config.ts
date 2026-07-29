import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

// Pin the workspace root. Without this, Next walks up and can select an unrelated
// package-lock.json outside the repo as the root, which silently changes module
// resolution.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: projectRoot,
  },
  // The judge worker talks to Docker and Postgres directly; never bundle those into a
  // client component by accident.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "bullmq", "ioredis"],
};

export default nextConfig;
