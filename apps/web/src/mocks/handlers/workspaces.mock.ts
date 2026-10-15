import type { WorkspacesApi } from '@/features/workspaces/api';
import { db } from '../db';
import { ApiError } from '@/services/http/ApiError';
import { simulate } from '../mockUtils';
import { requireSession } from './auth.mock';
import { mockLandlordApplications } from './landlord-application.mock';

export const workspacesMock: WorkspacesApi = {
  async listMine() {
    const { empty } = await simulate();
    return empty ? [] : requireSession().memberships.filter((m) => m.role === 'OWNER'); // V1: chỉ OWNER
  },

  /** Phản chiếu luật của backend: cần đơn APPROVED (nếu chưa là OWNER), tối đa 1 workspace ACTIVE / 2 workspace sở hữu. */
  async create(name) {
    await simulate();
    const record = requireSession();
    const owned = record.memberships.filter((m) => m.role === 'OWNER');
    const approved = mockLandlordApplications.get(record.user.id)?.status === 'APPROVED';
    if (!owned.length && !approved) {
      throw new ApiError({ statusCode: 403, code: 'LANDLORD_APPLICATION_REQUIRED', message: 'An approved landlord application is required' });
    }
    if (owned.some((m) => m.status === 'ACTIVE') || owned.length >= 2) {
      throw new ApiError({ statusCode: 409, code: 'WORKSPACE_ACTIVE_LIMIT_REACHED', message: 'Workspace limit reached' });
    }
    const workspaceId = `ws-${Date.now()}`;
    const membership = { workspaceId, name: name.trim(), status: 'ACTIVE' as const, role: 'OWNER' as const };
    record.memberships.push(membership);
    db.settings[workspaceId] = {
      id: workspaceId,
      name: membership.name,
      status: 'ACTIVE',
      description: '',
      contactName: record.user.fullName,
      contactPhone: record.user.phone,
      address: '',
      bankAccount: '',
      bankName: '',
      invoiceDueDay: 5,
    };
    return membership;
  },

  /** `PATCH /workspaces/:id/archive`: chỉ OWNER; đã lưu trữ thì trả lại nguyên trạng (idempotent); dữ liệu giữ nguyên. */
  async archive(workspaceId) {
    await simulate();
    return setLifecycle(workspaceId, 'ARCHIVED');
  },

  /** `PATCH /workspaces/:id/restore`: chỉ OWNER; không khôi phục được khi đã có workspace ACTIVE khác của cùng chủ trọ. */
  async restore(workspaceId) {
    await simulate();
    return setLifecycle(workspaceId, 'ACTIVE');
  },
};

function setLifecycle(workspaceId: string, target: 'ACTIVE' | 'ARCHIVED') {
  const record = requireSession();
  const owned = record.memberships.filter((m) => m.role === 'OWNER');
  const membership = owned.find((m) => m.workspaceId === workspaceId);
  if (!membership) throw new ApiError({ statusCode: 404, code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' });
  if (target === 'ACTIVE' && membership.status !== 'ACTIVE' && owned.some((m) => m.workspaceId !== workspaceId && m.status === 'ACTIVE')) {
    throw new ApiError({ statusCode: 409, code: 'WORKSPACE_ACTIVE_LIMIT_REACHED', message: 'Workspace limit reached' });
  }
  membership.status = target;
  const settings = db.settings[workspaceId];
  if (settings) settings.status = target;
  return { ...membership };
}
