const { config } = require('dotenv');
const { checkNeonConnection } = require('../src/database/prisma/check-neon');

config({ path: ['.env', '../../.env'], quiet: true });

if (process.env.DATABASE_ENABLED !== 'true' || !process.env.DATABASE_URL) {
  console.error(
    'Neon connection check requires DATABASE_ENABLED=true and DATABASE_URL. No connection was attempted.',
  );
  process.exit(1);
}

checkNeonConnection().catch(() => {
  console.error('Neon connection check failed. Connection details were not logged.');
  process.exitCode = 1;
});
