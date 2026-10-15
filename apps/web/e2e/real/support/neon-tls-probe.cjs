// Read-only identity + client-side TLS probe for the approved Neon development database.
// `pg_stat_ssl` reports the proxy->compute leg on Neon (always false), so the TLS evidence has to come
// from the client socket itself. The connection string arrives through the environment and is never printed.
const { Client } = require('pg');

const EXPECTED_DATABASE = 'Apartment';
const EXPECTED_USER = 'neondb_owner';

(async () => {
  const client = new Client({ connectionString: process.env.FE11_PROBE_DATABASE_URL });
  client.on('error', () => {});
  await client.connect();
  try {
    const stream = client.connection.stream;
    if (stream.encrypted !== true || stream.authorized !== true) throw new Error('socket is not an authorized TLS session');
    const protocol = typeof stream.getProtocol === 'function' ? stream.getProtocol() : null;
    if (protocol !== 'TLSv1.3' && protocol !== 'TLSv1.2') throw new Error('unexpected TLS protocol');
    const { rows } = await client.query('SELECT current_database() AS database_name, current_user AS database_user');
    const row = rows[0];
    if (!row || row.database_name !== EXPECTED_DATABASE || row.database_user !== EXPECTED_USER) {
      throw new Error('database identity does not match the approved target');
    }
    console.log(`PASS: ${EXPECTED_DATABASE}/${EXPECTED_USER} over ${protocol} with a verified certificate.`);
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error(`FAIL: ${error && error.message ? error.message.replace(/postgres(ql)?:\/\/\S+/g, '<redacted>') : 'probe failed'}`);
  process.exit(1);
});
