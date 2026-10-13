const { spawnSync } = require('node:child_process');
const { dirname, join } = require('node:path');
const { config } = require('dotenv');

config({ path: ['.env', '../../.env'], quiet: true });

const directUrl = process.env.DIRECT_URL;
const environment = process.env.DATABASE_ENVIRONMENT;
const allowedEnvironments = new Set(['development', 'test']);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!allowedEnvironments.has(environment)) {
  fail('Prisma database commands require DATABASE_ENVIRONMENT=development or test.');
}
if (!directUrl) {
  fail('Prisma database commands require DIRECT_URL. No database connection was attempted.');
}

let target;
try {
  target = new URL(directUrl);
} catch {
  fail('DIRECT_URL must be a valid PostgreSQL URL. Its value was not logged.');
}

if (!['postgres:', 'postgresql:'].includes(target.protocol)) {
  fail('DIRECT_URL must use the PostgreSQL protocol.');
}
if (target.hostname !== 'ep-winter-math-azeayw91.c-3.ap-southeast-1.aws.neon.tech') {
  fail('DIRECT_URL must use the approved direct Neon development host.');
}
if (decodeURIComponent(target.pathname.slice(1)) !== 'Apartment') {
  fail('DIRECT_URL must target the approved Apartment database.');
}
if (decodeURIComponent(target.username) !== 'neondb_owner') {
  fail('DIRECT_URL must use the approved Neon database user.');
}
if (target.searchParams.get('sslmode') !== 'require') {
  fail('DIRECT_URL must include sslmode=require.');
}
if (target.searchParams.get('channel_binding') !== 'require') {
  fail('DIRECT_URL must include channel_binding=require.');
}

const command = process.argv.slice(2);
if (command.length === 0) fail('A Prisma database command is required.');

const prismaPackage = require.resolve('prisma/package.json');
const prismaCli = join(dirname(prismaPackage), 'build', 'index.js');
const result = spawnSync(
  process.execPath,
  [prismaCli, ...command, '--config', 'prisma.config.ts'],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  },
);

if (result.error) fail('Unable to start Prisma CLI.');
process.exit(result.status ?? 1);
