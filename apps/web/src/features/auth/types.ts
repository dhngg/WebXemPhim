/** Role toàn cục. LANDLORD KHÔNG phải global role — quyền quản lý đến từ workspace membership. */
export type GlobalRole = 'USER' | 'ADMIN';

export interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  globalRole: GlobalRole;
  /** Có hồ sơ người thuê đã liên kết hợp lệ hay chưa (do backend quyết định). */
  tenantLinked: boolean;
  createdAt: string;
}

export interface LoginInput {
  /** Phương thức đăng nhập (email hay SĐT) chưa chốt — tạm nhận cả hai. */
  identifier: string;
  password: string;
}

export interface RegisterInput {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  acceptTerms: true;
}

export interface UpdateProfileInput {
  fullName: string;
  phone: string;
}
