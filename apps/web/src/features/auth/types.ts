/** Role toàn cục. LANDLORD KHÔNG phải global role — quyền quản lý đến từ workspace membership. */
export type GlobalRole = 'USER' | 'ADMIN';

export interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  /** Chưa có ở backend: luôn rỗng khi dùng API thật. */
  phone: string;
  avatarUrl?: string;
  globalRole: GlobalRole;
  /** Có hồ sơ người thuê đã liên kết hợp lệ hay chưa (do backend quyết định). */
  tenantLinked: boolean;
  createdAt: string;
}

export interface LoginInput {
  /** Email đăng nhập (backend chỉ hỗ trợ email). */
  identifier: string;
  password: string;
}

export interface RegisterInput {
  fullName: string;
  email: string;
  /** Backend chưa lưu số điện thoại: không hiển thị ở form, không gửi đi. */
  phone?: string;
  password: string;
  acceptTerms: true;
}

export interface ResetPasswordInput {
  /** Token một lần trong liên kết email gửi tới người dùng. */
  token: string;
  password: string;
}

export interface UpdateProfileInput {
  fullName: string;
  /** Backend chưa lưu số điện thoại: chỉ `fullName` (displayName) được gửi. */
  phone?: string;
}
