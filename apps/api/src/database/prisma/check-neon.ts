import { loadEnvironment } from '../../config/environment';
import { PrismaService } from './prisma.service';

interface NeonProbeRow {
  database_name: string;
  database_user: string;
  ssl_enabled: boolean;
}

export async function checkNeonConnection(): Promise<void> {
  const environment = loadEnvironment();
  if (!environment.DATABASE_ENABLED || !environment.DATABASE_URL) {
    throw new Error('Neon connection check requires DATABASE_ENABLED=true and DATABASE_URL');
  }

  const prisma = new PrismaService(environment.DATABASE_URL);
  try {
    await prisma.$connect();
    const rows = await prisma.$queryRaw<NeonProbeRow[]>`
      SELECT current_database() AS database_name,
              current_user AS database_user,
              COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS ssl_enabled
    `;
    const row = rows[0];
    if (!row || row.database_name !== 'Apartment' || row.database_user !== 'neondb_owner') {
      throw new Error('Connected database identity does not match the approved Neon target');
    }
    if (!row.ssl_enabled) throw new Error('Neon connection is not using TLS');
    console.log('PASS: Prisma Client connected to the approved Neon database over TLS.');
  } finally {
    await prisma.$disconnect();
  }
}
