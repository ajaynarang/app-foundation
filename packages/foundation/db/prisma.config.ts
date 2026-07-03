import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

// Env loading: the db package has no .env of its own by default — the backend
// owns runtime configuration. Load whichever exists, package-local first.
for (const envPath of [path.resolve(__dirname, '.env'), path.resolve(__dirname, '../../../apps/backend/.env')]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    // Use placeholder during build, real value from env at runtime
    url: process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
});
