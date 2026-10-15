const { randomUUID, createHash } = require('node:crypto');
const { config } = require('dotenv');
const { Client } = require('pg');

config({ path: ['.env', '../../.env'], quiet: true });

const API = 'http://127.0.0.1:3000/api/v1';
const ORIGIN = 'http://localhost:5173';
const TEST_PREFIX = `onboarding-smoke-${Date.now()}`;
const users = [];
const workspaces = [];
const links = [];
const tenants = [];
const buildings = [];
const contracts = [];
let adminGrantAdded = false;
let client;
let existingOwnerBaseline = 0;

function assertTarget() {
  if (process.argv[2] !== '--confirm-live-dev')
    throw new Error('Pass --confirm-live-dev to run write-enabled development smoke tests.');
  if (
    process.env.DATABASE_ENVIRONMENT !== 'development' ||
    process.env.DATABASE_ENABLED !== 'true' ||
    process.env.AUTH_ENABLED !== 'true'
  ) {
    throw new Error(
      'Smoke tests require DATABASE_ENVIRONMENT=development, DATABASE_ENABLED=true and AUTH_ENABLED=true.',
    );
  }
  const db = new URL(process.env.DATABASE_URL || '');
  const direct = new URL(process.env.DIRECT_URL || '');
  if (
    db.hostname !== 'ep-winter-math-azeayw91-pooler.c-3.ap-southeast-1.aws.neon.tech' ||
    direct.hostname !== 'ep-winter-math-azeayw91.c-3.ap-southeast-1.aws.neon.tech' ||
    decodeURIComponent(db.pathname.slice(1)) !== 'Apartment' ||
    decodeURIComponent(direct.pathname.slice(1)) !== 'Apartment' ||
    decodeURIComponent(db.username) !== 'neondb_owner' ||
    decodeURIComponent(direct.username) !== 'neondb_owner'
  ) {
    throw new Error(
      'Smoke tests refuse any database except the approved Neon development Apartment target.',
    );
  }
}

async function call(method, path, { token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      origin: ORIGIN,
      'x-csrf-protection': '1',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

function check(label, condition) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

function expectHttp(label, result, status, code) {
  check(label, result.status === status && (!code || result.data?.code === code));
}

async function register(label) {
  const email = `${TEST_PREFIX}-${label}@example.invalid`;
  const result = await call('POST', '/auth/register', {
    body: { email, password: `Smoke-${randomUUID()}-Aa9!`, displayName: `Smoke ${label}` },
  });
  if (result.status !== 201 || !result.data?.accessToken || !result.data?.user?.id) {
    throw new Error(
      `Register failed for fixture ${label}: HTTP ${result.status} ${result.data?.code || ''}`,
    );
  }
  const user = { id: result.data.user.id, email, token: result.data.accessToken, label };
  users.push(user);
  return user;
}

async function adminRequest(method, path, body) {
  const result = await call(method, path, { token: admin.token, ...(body ? { body } : {}) });
  if (result.status >= 500)
    throw new Error(`Unexpected HTTP ${result.status} on ${method} ${path}`);
  return result;
}

async function cleanup() {
  if (!client) return;
  const owner = users.find((user) => user.label === 'owner');
  const tenantUser = users.find((user) => user.label === 'tenant');
  const outsider = users.find((user) => user.label === 'outsider');
  for (const contract of contracts) {
    try {
      await call('PATCH', `/workspaces/${contract.workspaceId}/contracts/${contract.id}/end`, {
        token: contract.owner.token,
        body: { endDate: new Date().toISOString().slice(0, 10) },
      });
    } catch {
      // Best-effort cleanup continues so the remaining fixtures are still retired.
    }
  }
  for (const link of links) {
    try {
      await call('PATCH', `/workspaces/${link.workspaceId}/tenant-user-links/${link.id}/revoke`, {
        token: link.owner.token,
        body: { reason: 'Smoke-test cleanup; retain link history.' },
      });
    } catch {
      // Best-effort cleanup continues so the remaining fixtures are still retired.
    }
  }
  for (const tenant of tenants) {
    try {
      await call('PATCH', `/workspaces/${tenant.workspaceId}/tenants/${tenant.id}/archive`, {
        token: tenant.owner.token,
      });
    } catch {
      // Best-effort cleanup continues so the remaining fixtures are still retired.
    }
  }
  for (const building of buildings) {
    try {
      await call('PATCH', `/workspaces/${building.workspaceId}/buildings/${building.id}/archive`, {
        token: building.owner.token,
      });
    } catch {
      // Best-effort cleanup continues so the remaining fixtures are still retired.
    }
  }
  for (const workspace of workspaces) {
    try {
      await call('PATCH', `/workspaces/${workspace.id}/archive`, { token: workspace.owner.token });
    } catch {
      // Best-effort cleanup continues so the remaining fixtures are still retired.
    }
  }
  for (const user of users) {
    try {
      await call('POST', '/auth/logout-all', { token: user.token, body: {} });
    } catch {
      // Best-effort cleanup continues so the remaining fixtures are still retired.
    }
  }
  if (users.length) {
    await client.query(
      `UPDATE users SET status='DISABLED', disabled_at=COALESCE(disabled_at, NOW()), updated_at=NOW()
       WHERE id = ANY($1::uuid[]) AND status='ACTIVE'`,
      [users.map((user) => user.id)],
    );
  }
  if (adminGrantAdded && admin) {
    await client.query(
      `UPDATE platform_admins SET granted_note='Disabled live-smoke fixture; audit retained' WHERE user_id=$1`,
      [admin.id],
    );
  }
  void owner;
  void tenantUser;
  void outsider;
}

let admin;

async function main() {
  assertTarget();
  client = new Client({
    connectionString: process.env.DIRECT_URL,
    connectionTimeoutMillis: 5000,
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  const identity = await client.query('SELECT current_database() AS db, current_user AS role');
  check(
    'PostgreSQL identity is development Apartment',
    identity.rows[0]?.db === 'Apartment' && identity.rows[0]?.role === 'neondb_owner',
  );
  const oldOwnerBaseline = await client.query(
    `SELECT count(*)::int AS owner_workspaces FROM workspace_memberships WHERE role='OWNER'`,
  );
  existingOwnerBaseline = oldOwnerBaseline.rows[0].owner_workspaces;

  admin = await register('admin');
  const adminExists = await client.query('SELECT 1 FROM platform_admins WHERE user_id=$1', [
    admin.id,
  ]);
  if (adminExists.rowCount) throw new Error('Unexpected platform admin fixture collision.');
  await client.query(
    `INSERT INTO platform_admins (user_id, granted_note) VALUES ($1, 'Temporary Neon onboarding smoke fixture')`,
    [admin.id],
  );
  adminGrantAdded = true;
  const adminCaps = await call('GET', '/users/me/capabilities', { token: admin.token });
  check(
    'Capabilities reflects DB-backed Platform Admin grant',
    adminCaps.status === 200 && adminCaps.data.isPlatformAdmin === true,
  );

  const owner = await register('owner');
  const secondOwner = await register('concurrent-owner');
  const tenantUser = await register('tenant');
  const outsider = await register('outsider');
  const ownerCapsBefore = await call('GET', '/users/me/capabilities', { token: owner.token });
  check(
    'New account capabilities contain no unrelated identity or memberships',
    ownerCapsBefore.status === 200 &&
      ownerCapsBefore.data.isPlatformAdmin === false &&
      ownerCapsBefore.data.workspaces.length === 0 &&
      !JSON.stringify(ownerCapsBefore.data).includes(admin.email),
  );

  const deniedAdminList = await call('GET', '/admin/landlord-applications?status=PENDING', {
    token: owner.token,
  });
  expectHttp(
    'Non-admin cannot access landlord review API',
    deniedAdminList,
    403,
    'PLATFORM_ADMIN_REQUIRED',
  );
  const deniedWorkspace = await call('POST', '/workspaces', {
    token: owner.token,
    body: { name: `${TEST_PREFIX}-blocked` },
  });
  expectHttp(
    'User cannot create first Workspace before approval',
    deniedWorkspace,
    403,
    'LANDLORD_APPLICATION_REQUIRED',
  );

  const ownerApplication = await call('POST', '/landlord-applications/me', {
    token: owner.token,
    body: { reason: 'Live smoke approval path.' },
  });
  check(
    'Applicant can submit landlord application',
    ownerApplication.status === 201 && ownerApplication.data.status === 'PENDING',
  );
  const pendingCaps = await call('GET', '/users/me/capabilities', { token: owner.token });
  check(
    'Capabilities reports own PENDING application',
    pendingCaps.status === 200 && pendingCaps.data.landlordApplication?.status === 'PENDING',
  );

  const rejectedApplication = await call('POST', '/landlord-applications/me', {
    token: outsider.token,
    body: { reason: 'Live smoke rejection path.' },
  });
  check('Second applicant can submit for rejection path', rejectedApplication.status === 201);
  const reject = await adminRequest(
    'POST',
    `/admin/landlord-applications/${rejectedApplication.data.id}/reject`,
    { reason: 'Live smoke rejection verification.' },
  );
  check(
    'Platform Admin can reject once and records REJECTED',
    reject.status === 200 && reject.data.status === 'REJECTED',
  );
  const rejectAudit = await client.query(
    `SELECT count(*)::int AS n FROM admin_audit_logs WHERE target_type='LANDLORD_APPLICATION' AND target_id=$1 AND action='LANDLORD_APPLICATION_REJECTED'`,
    [rejectedApplication.data.id],
  );
  check('Rejection audit persisted in PostgreSQL', rejectAudit.rows[0].n === 1);

  const approve = await adminRequest(
    'POST',
    `/admin/landlord-applications/${ownerApplication.data.id}/approve`,
    { reason: 'Live smoke approval verification.' },
  );
  check(
    'Platform Admin can approve once',
    approve.status === 200 && approve.data.status === 'APPROVED',
  );
  expectHttp(
    'Repeated decision is rejected rather than duplicated',
    await adminRequest('POST', `/admin/landlord-applications/${ownerApplication.data.id}/approve`, {
      reason: 'Duplicate decision attempt.',
    }),
    409,
    'LANDLORD_APPLICATION_INVALID_TRANSITION',
  );
  const ownerWorkspaceResult = await call('POST', '/workspaces', {
    token: owner.token,
    body: { name: `${TEST_PREFIX}-owner-workspace` },
  });
  check(
    'Approved applicant creates first Workspace as OWNER',
    ownerWorkspaceResult.status === 201 &&
      ownerWorkspaceResult.data.currentMembership?.role === 'OWNER',
  );
  const ownerWorkspace = { id: ownerWorkspaceResult.data.id, owner };
  workspaces.push(ownerWorkspace);
  expectHttp(
    'One ACTIVE Workspace limit blocks a second create',
    await call('POST', '/workspaces', {
      token: owner.token,
      body: { name: `${TEST_PREFIX}-owner-second` },
    }),
    409,
    'WORKSPACE_ACTIVE_LIMIT_REACHED',
  );
  const ownerCaps = await call('GET', '/users/me/capabilities', { token: owner.token });
  check(
    'Capabilities returns only caller OWNER membership and approved state',
    ownerCaps.status === 200 &&
      ownerCaps.data.workspaces.length === 1 &&
      ownerCaps.data.workspaces[0].role === 'OWNER' &&
      ownerCaps.data.landlordApplication?.status === 'APPROVED' &&
      !JSON.stringify(ownerCaps.data).includes(outsider.email),
  );

  const secondApplication = await call('POST', '/landlord-applications/me', {
    token: secondOwner.token,
    body: { reason: 'Live smoke concurrent Workspace creation.' },
  });
  const secondApprove = await adminRequest(
    'POST',
    `/admin/landlord-applications/${secondApplication.data.id}/approve`,
    { reason: 'Live smoke concurrent Workspace creation approval.' },
  );
  check(
    'Second applicant approval persisted',
    secondApprove.status === 200 && secondApprove.data.status === 'APPROVED',
  );
  const concurrent = await Promise.all([
    call('POST', '/workspaces', {
      token: secondOwner.token,
      body: { name: `${TEST_PREFIX}-race-a` },
    }),
    call('POST', '/workspaces', {
      token: secondOwner.token,
      body: { name: `${TEST_PREFIX}-race-b` },
    }),
  ]);
  console.log(
    `INFO: concurrent create responses ${concurrent.map((r) => `${r.status}:${r.data?.code || 'ok'}`).join(', ')}`,
  );
  check(
    'Concurrent Workspace creates produce exactly one success and one 409 (no HTTP 500)',
    concurrent.filter((r) => r.status === 201).length === 1 &&
      concurrent.filter(
        (r) => r.status === 409 && r.data?.code === 'WORKSPACE_ACTIVE_LIMIT_REACHED',
      ).length === 1 &&
      concurrent.every((r) => r.status < 500),
  );
  const secondCreated = concurrent.find((r) => r.status === 201);
  if (secondCreated) workspaces.push({ id: secondCreated.data.id, owner: secondOwner });

  const workspaceId = ownerWorkspace.id;
  const buildingResult = await call('POST', `/workspaces/${workspaceId}/buildings`, {
    token: owner.token,
    body: {
      name: `${TEST_PREFIX}-building`,
      addressLine1: 'Smoke Test Street 1',
      city: 'Ho Chi Minh City',
    },
  });
  check('Workspace OWNER can create isolated smoke building', buildingResult.status === 201);
  const building = { id: buildingResult.data.id, workspaceId, owner };
  buildings.push(building);
  const roomResult = await call(
    'POST',
    `/workspaces/${workspaceId}/buildings/${building.id}/rooms`,
    {
      token: owner.token,
      body: {
        code: `${Date.now()}`.slice(-10),
        areaSqm: '20.00',
        monthlyRent: '3000000.00',
        maxOccupants: 2,
      },
    },
  );
  check('Workspace OWNER can create a VACANT room for contract smoke', roomResult.status === 201);

  const tenantResult = await call('POST', `/workspaces/${workspaceId}/tenants`, {
    token: owner.token,
    body: { fullName: 'Onboarding Smoke Tenant' },
  });
  check('Workspace OWNER can create isolated tenant profile', tenantResult.status === 201);
  const tenant = { id: tenantResult.data.id, workspaceId, owner };
  tenants.push(tenant);
  const invitation = await call(
    'POST',
    `/workspaces/${workspaceId}/tenants/${tenant.id}/invitations`,
    { token: owner.token },
  );
  check(
    'OWNER can issue invitation with one-time raw token',
    invitation.status === 201 &&
      typeof invitation.data.token === 'string' &&
      invitation.data.token.length === 43,
  );
  if (invitation.status !== 201) throw new Error('Invitation creation failed.');
  const invitationRow = await client.query(
    'SELECT token_hash FROM tenant_invitations WHERE id=$1',
    [invitation.data.id],
  );
  const expectedHash = createHash('sha256')
    .update(`tenant-invitation:v1:${invitation.data.token}`)
    .digest();
  check(
    'PostgreSQL stores only matching token digest',
    invitationRow.rowCount === 1 &&
      Buffer.from(invitationRow.rows[0].token_hash).equals(expectedHash),
  );
  const accept = await call('POST', '/tenant-invitations/accept', {
    token: tenantUser.token,
    body: { token: invitation.data.token },
  });
  check(
    'Tenant user accepts invitation and is linked',
    accept.status === 201 &&
      accept.data.userId === tenantUser.id &&
      accept.data.tenantId === tenant.id,
  );
  if (accept.status === 201) links.push({ id: accept.data.id, workspaceId, owner });
  expectHttp(
    'Accepted invitation token cannot be reused',
    await call('POST', '/tenant-invitations/accept', {
      token: tenantUser.token,
      body: { token: invitation.data.token },
    }),
    400,
    'TENANT_INVITATION_INVALID',
  );
  expectHttp(
    'Already linked tenant cannot receive a duplicate invitation',
    await call('POST', `/workspaces/${workspaceId}/tenants/${tenant.id}/invitations`, {
      token: owner.token,
    }),
    409,
    'TENANT_INVITATION_CONFLICT',
  );
  const tenantCaps = await call('GET', '/users/me/capabilities', { token: tenantUser.token });
  check(
    'Tenant capabilities shows only own verified link',
    tenantCaps.status === 200 &&
      tenantCaps.data.tenantLinks.length === 1 &&
      tenantCaps.data.tenantLinks[0].tenantId === tenant.id &&
      !JSON.stringify(tenantCaps.data).includes(outsider.email),
  );

  const contractResult = await call('POST', `/workspaces/${workspaceId}/contracts`, {
    token: owner.token,
    body: {
      roomId: roomResult.data.id,
      tenantId: tenant.id,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
      monthlyRent: '3000000.00',
    },
  });
  check('OWNER can create contract for the linked tenant profile', contractResult.status === 201);
  if (contractResult.status === 201)
    contracts.push({ id: contractResult.data.id, workspaceId, owner });
  const ownContracts = await call('GET', '/contracts/me', { token: tenantUser.token });
  check(
    'Tenant sees own contract via /contracts/me',
    ownContracts.status === 200 &&
      ownContracts.data.total === 1 &&
      ownContracts.data.items[0].id === contractResult.data.id,
  );
  const ownDetail = await call('GET', `/contracts/me/${contractResult.data.id}`, {
    token: tenantUser.token,
  });
  check(
    'Tenant can view own contract detail',
    ownDetail.status === 200 && ownDetail.data.id === contractResult.data.id,
  );

  const oldTenantResult = await call('POST', `/workspaces/${workspaceId}/tenants`, {
    token: owner.token,
    body: { fullName: 'Onboarding Smoke Legacy Link Tenant' },
  });
  check('Legacy-link smoke tenant profile created', oldTenantResult.status === 201);
  const oldTenant = { id: oldTenantResult.data.id, workspaceId, owner };
  tenants.push(oldTenant);
  const linkRequest = await call('POST', `/tenants/${oldTenant.id}/link-requests`, {
    token: outsider.token,
    body: { message: 'Legacy tenant-link compatibility smoke.' },
  });
  check(
    'Existing tenant-link request flow still creates request',
    linkRequest.status === 201 && linkRequest.data.status === 'PENDING',
  );
  const oldLink = await call(
    'PATCH',
    `/workspaces/${workspaceId}/tenant-link-requests/${linkRequest.data.id}/approve`,
    { token: owner.token, body: { note: 'Legacy flow retained.' } },
  );
  check(
    'OWNER approves existing tenant-link request flow',
    oldLink.status === 200 && oldLink.data.userId === outsider.id,
  );
  if (oldLink.status === 200) links.push({ id: oldLink.data.id, workspaceId, owner });
  const sources = await client.query(
    'SELECT link_request_id, invitation_id FROM tenant_user_links WHERE id = ANY($1::uuid[]) ORDER BY link_request_id NULLS FIRST',
    [[accept.data.id, oldLink.data.id]],
  );
  check(
    'Invitation and legacy links persist with exactly their respective source columns',
    sources.rowCount === 2 &&
      sources.rows.some(
        (r) => r.invitation_id === invitation.data.id && r.link_request_id === null,
      ) &&
      sources.rows.some(
        (r) => r.link_request_id === linkRequest.data.id && r.invitation_id === null,
      ),
  );

  const outsiderContracts = await call('GET', '/contracts/me', { token: outsider.token });
  check(
    'Other tenant cannot list a different tenant contract',
    outsiderContracts.status === 200 &&
      outsiderContracts.data.total === 0 &&
      outsiderContracts.data.items.length === 0,
  );
  expectHttp(
    'Other tenant cannot open another tenant contract detail',
    await call('GET', `/contracts/me/${contractResult.data.id}`, { token: outsider.token }),
    404,
    'CONTRACT_NOT_FOUND',
  );
  const auditCount = await client.query(
    `SELECT count(*)::int AS n FROM admin_audit_logs WHERE target_type='LANDLORD_APPLICATION' AND action IN ('LANDLORD_APPLICATION_APPROVED','LANDLORD_APPLICATION_REJECTED') AND target_id=ANY($1::uuid[])`,
    [[ownerApplication.data.id, rejectedApplication.data.id, secondApplication.data.id]],
  );
  check('Approval and rejection audit entries retained in PostgreSQL', auditCount.rows[0].n === 3);

  const ownerBaselineAfter = await client.query(
    `SELECT count(*)::int AS owner_workspaces FROM workspace_memberships m JOIN users u ON u.id=m.user_id WHERE m.role='OWNER' AND u.email NOT LIKE $1`,
    [`${TEST_PREFIX}-%`],
  );
  check(
    'Existing OWNER membership rows were not changed by smoke',
    ownerBaselineAfter.rows[0].owner_workspaces === existingOwnerBaseline,
  );
  console.log('SMOKE_TEST_BODY_PASS');
}

main()
  .catch((error) => {
    console.error(error?.message || 'Live smoke test failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch (error) {
      console.error(`CLEANUP_WARNING: ${error?.message || 'cleanup failed'}`);
      process.exitCode = 1;
    }
    if (client) await client.end();
    if (process.exitCode === 1)
      console.error(
        'Smoke fixtures were disabled/archived where possible; audit records were retained.',
      );
  });
