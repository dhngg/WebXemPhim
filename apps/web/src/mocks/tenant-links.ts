import type { TenantUserLinkResponse } from '@rental/shared';
import { ApiError } from '@/services/http/ApiError';
import { mockUsers } from './data/users';
import { db, nextId } from './db';

/**
 * Sổ liên kết tài khoản ↔ hồ sơ người thuê và mã mời cho mock, theo đúng quy tắc backend:
 * mỗi hồ sơ chỉ có một tài khoản liên kết còn hiệu lực; mỗi tài khoản chỉ liên kết một hồ sơ trong MỘT workspace
 * (nhiều workspace thì nhiều liên kết); mã mời dùng một lần, có hạn. CHỈ dùng khi VITE_USE_MOCK_API=true.
 */
export interface MockTenantRecord {
  id: string;
  workspaceId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  address: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const SECOND_WORKSPACE = { id: 'ws-sunhouse', name: 'SunHouse Cầu Giấy' };
/** Hồ sơ ở workspace thứ hai: để thử người dùng có nhiều liên kết (khác workspace). */
const secondWorkspaceTenant: MockTenantRecord = {
  id: 'ten-sh-1',
  workspaceId: SECOND_WORKSPACE.id,
  fullName: 'Phạm Minh Châu',
  phone: '0988111222',
  email: 'chau@mail.vn',
  dateOfBirth: '1997-05-12',
  address: 'Hà Nội',
  status: 'ACTIVE',
  archivedAt: null,
  createdAt: '2025-11-01T03:00:00.000Z',
  updatedAt: '2025-11-01T03:00:00.000Z',
};

export function workspaceName(workspaceId: string): string {
  if (workspaceId === SECOND_WORKSPACE.id) return SECOND_WORKSPACE.name;
  for (const u of mockUsers) {
    const m = u.memberships.find((x) => x.workspaceId === workspaceId);
    if (m) return m.name;
  }
  return workspaceId;
}

export function tenantRecord(id: string): MockTenantRecord | undefined {
  if (id === secondWorkspaceTenant.id) return secondWorkspaceTenant;
  const t = db.tenants.find((x) => x.id === id);
  if (!t) return undefined;
  return {
    id: t.id,
    workspaceId: t.workspaceId,
    fullName: t.fullName,
    phone: t.phone || null,
    email: t.email ?? null,
    dateOfBirth: t.dateOfBirth ?? null,
    address: t.hometown ?? null,
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: t.createdAt,
    updatedAt: t.createdAt,
  };
}

const extraLinks = new Map<string, string[]>();
const linkMeta = new Map<string, { id: string; linkedAt: string }>();

/** Hồ sơ còn liên kết của tài khoản (liên kết đã gỡ không còn ở đây, nên mọi dữ liệu theo nó biến mất). */
export function activeTenantIds(userId: string): string[] {
  const primary = db.tenantLinks[userId];
  return [...(primary ? [primary] : []), ...(extraLinks.get(userId) ?? [])];
}
export function linkedUserOf(tenantId: string): string | undefined {
  const main = Object.entries(db.tenantLinks).find(([, t]) => t === tenantId)?.[0];
  if (main) return main;
  for (const [userId, ids] of extraLinks) if (ids.includes(tenantId)) return userId;
  return undefined;
}
export const linkMetaOf = (userId: string, tenantId: string) => linkMeta.get(`${userId}:${tenantId}`);

function createLink(userId: string, tenantId: string): TenantUserLinkResponse {
  const profile = tenantRecord(tenantId)!;
  const linkedAt = new Date().toISOString();
  const id = nextId('tul');
  linkMeta.set(`${userId}:${tenantId}`, { id, linkedAt });
  if (profile.workspaceId === db.tenants[0]?.workspaceId && !db.tenantLinks[userId]) db.tenantLinks[userId] = tenantId;
  else extraLinks.set(userId, [...(extraLinks.get(userId) ?? []), tenantId]);
  const account = mockUsers.find((u) => u.user.id === userId);
  if (account) account.user = { ...account.user, tenantLinked: true };
  return { id, workspaceId: profile.workspaceId, tenantId, userId, linkedAt, revokedAt: null };
}

// ------------------------------------------------------------------------------------------------ mã mời
interface Invitation {
  tenantId: string;
  expiresAt: string;
  acceptedAt: string | null;
}
const invitations = new Map<string, Invitation>();
const DAY = 86_400_000;

/** Mã mời hợp lệ đúng 43 ký tự base64url (đệm bằng chữ x). */
const token = (label: string) => `${label}_`.padEnd(43, 'x').slice(0, 43);
/** Mã mời mẫu cho chế độ demo và test (mã thật do chủ trọ tạo qua `createInvitation`). */
export const DEMO_INVITATIONS = {
  /** Hồ sơ Lê Hoàng Yến (ten-2), workspace An Nhiên. */
  valid: token('DEMO-valid-ten-2'),
  /** Hồ sơ ở workspace thứ hai (SunHouse): cho phép liên kết thêm khi đã có liên kết ở An Nhiên. */
  validSecondWorkspace: token('DEMO-valid-sunhouse'),
  /** Hết hạn. */
  expired: token('DEMO-expired'),
  /** Đã được dùng. */
  used: token('DEMO-used'),
  /** Hồ sơ ten-1 đã có tài khoản liên kết. */
  conflict: token('DEMO-conflict-ten-1'),
} as const;

invitations.set(DEMO_INVITATIONS.valid, { tenantId: 'ten-2', expiresAt: new Date(Date.now() + 30 * DAY).toISOString(), acceptedAt: null });
invitations.set(DEMO_INVITATIONS.validSecondWorkspace, { tenantId: secondWorkspaceTenant.id, expiresAt: new Date(Date.now() + 30 * DAY).toISOString(), acceptedAt: null });
invitations.set(DEMO_INVITATIONS.expired, { tenantId: 'ten-3', expiresAt: new Date(Date.now() - DAY).toISOString(), acceptedAt: null });
invitations.set(DEMO_INVITATIONS.used, { tenantId: 'ten-4', expiresAt: new Date(Date.now() + 30 * DAY).toISOString(), acceptedAt: new Date(Date.now() - 2 * DAY).toISOString() });
invitations.set(DEMO_INVITATIONS.conflict, { tenantId: 'ten-1', expiresAt: new Date(Date.now() + 30 * DAY).toISOString(), acceptedAt: null });

/** Chủ trọ tạo mã mời (mock `createInvitation`): ghi lại để người thuê dùng được. */
export function registerInvitation(tokenValue: string, tenantId: string, expiresAt: string) {
  invitations.set(tokenValue, { tenantId, expiresAt, acceptedAt: null });
}

const fail = (status: number, code: string, message: string): never => {
  throw new ApiError({ statusCode: status, code, message });
};

/** `POST /tenant-invitations/accept`: sai/hết hạn/đã dùng → 400 INVALID (không phân biệt); đã có liên kết → 409. */
export function acceptInvitation(userId: string, value: string): TenantUserLinkResponse {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) fail(400, 'VALIDATION_ERROR', 'token must match the 43 character base64url format');
  const inv = invitations.get(value);
  const profile = inv ? tenantRecord(inv.tenantId) : undefined;
  if (!inv || !profile || inv.acceptedAt || Date.parse(inv.expiresAt) <= Date.now() || profile.status !== 'ACTIVE') {
    fail(400, 'TENANT_INVITATION_INVALID', 'Tenant invitation is invalid or expired');
  }
  const sameWorkspace = activeTenantIds(userId).some((id) => tenantRecord(id)?.workspaceId === profile!.workspaceId);
  if (linkedUserOf(profile!.id) || sameWorkspace) fail(409, 'TENANT_INVITATION_CONFLICT', 'Tenant invitation cannot be accepted because a link already exists');
  const link = createLink(userId, profile!.id);
  inv!.acceptedAt = new Date().toISOString();
  return link;
}
