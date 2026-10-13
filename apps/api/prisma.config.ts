import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: ['.env', '../../.env'], quiet: true });

// Validation/generation do not need a live database. Commands that connect are
// routed through scripts/prisma-database-command.cjs, which rejects this fallback.
const offlineUrl = 'postgresql://offline:offline@127.0.0.1:5432/offline';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || offlineUrl,
  },
});
