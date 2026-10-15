import { forwardRef, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Eye, EyeOff, KeyRound, LinkIcon, MailCheck } from 'lucide-react';
import { Button, ButtonLink, FormField, MockBadge, useToast } from '@/components/ui';
import { useLogin, useRegister, useRequestPasswordReset, useResetPassword } from '@/features/auth/hooks';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type LoginForm,
  type RegisterForm,
  type ResetPasswordForm,
} from '@/features/auth/schemas';
import { demoResetLink } from '@/mocks/handlers/auth.mock';
import { toApiError } from '@/services/http/ApiError';
import { env } from '@/lib/env';
import { landingFor, safeRedirect } from '@/features/auth/landing';
import { capabilityKeys } from '@/features/capabilities/hooks';
import type { Capabilities } from '@/features/capabilities/model';
import { useQueryClient } from '@tanstack/react-query';

const DEMO_ACCOUNTS = [
  { email: 'quan@demo.vn', label: 'Chủ trọ (OWNER) – Nguyễn Văn Quân' },
  { email: 'nam@demo.vn', label: 'Người thuê đã liên kết – Trần Văn Nam' },
  { email: 'minh@demo.vn', label: 'Người dùng thường – Lê Minh' },
  { email: 'admin@demo.vn', label: 'Quản trị nền tảng – ADMIN' },
];


const PasswordInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function PasswordInput(props, ref) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input ref={ref} {...props} type={show ? 'text' : 'password'} className="input" style={{ paddingRight: 44 }} />
      <button
        type="button"
        className="icon-btn"
        style={{ position: 'absolute', right: 2, top: 1, width: 40, height: 40 }}
        aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        onClick={() => setShow((v) => !v)}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
});

/** AUTH-01 */
export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const login = useLogin();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema), defaultValues: { identifier: '', password: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login.mutateAsync(values);
      // Quyền thật đã được lấy ngay sau đăng nhập (useLogin) nên chọn được đúng khu vực đích.
      navigate(safeRedirect(params.get('redirect')) ?? landingFor(qc.getQueryData<Capabilities>(capabilityKeys.me)), { replace: true });
    } catch (e) {
      setFormError(toApiError(e).message);
    }
  });

  return (
    <div className="auth-page">
      <div className="card auth-card stack">
        <div>
          <h1>Đăng nhập</h1>
          <p className="muted text-sm">Chào mừng bạn quay lại Rental Platform.</p>
        </div>
        {formError && (
          <div className="alert alert--danger" role="alert">
            {formError}
          </div>
        )}
        <form className="stack" onSubmit={onSubmit} noValidate>
          <FormField label="Email" required error={errors.identifier?.message}>
            <input className="input" type="email" autoComplete="username" {...register('identifier')} />
          </FormField>
          <FormField label="Mật khẩu" required error={errors.password?.message}>
            <PasswordInput autoComplete="current-password" {...register('password')} />
          </FormField>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Link to="/forgot-password" className="text-sm">
              Quên mật khẩu?
            </Link>
          </div>
          <Button type="submit" variant="dark" size="lg" block loading={login.isPending}>
            Đăng nhập
          </Button>
        </form>
        <p className="text-sm muted" style={{ textAlign: 'center' }}>
          Chưa có tài khoản? <Link to={`/register${params.toString() ? `?${params}` : ''}`}>Đăng ký ngay</Link>
        </p>
        {env.useMockApi && (
          <div className="demo-accounts">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <strong>Tài khoản demo</strong>
              <MockBadge>Mật khẩu: demo1234</MockBadge>
            </div>
            <div className="stack" style={{ gap: 2 }}>
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setValue('identifier', a.email);
                    setValue('password', 'demo1234');
                  }}
                >
                  {a.email} — {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** AUTH-02 */
export function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const registerMutation = useRegister();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    const parsed = registerSchema.parse(values);
    try {
      await registerMutation.mutateAsync({
        fullName: parsed.fullName,
        email: parsed.email,
        password: parsed.password,
        acceptTerms: true,
      });
      toast.success('Tạo tài khoản thành công!');
      navigate(safeRedirect(params.get('redirect')) ?? '/', { replace: true });
    } catch (e) {
      const err = toApiError(e);
      if (err.code === 'EMAIL_ALREADY_EXISTS') setError('email', { message: err.message });
      Object.entries(err.fieldErrors ?? {}).forEach(([f, m]) => setError(f as keyof RegisterForm, { message: m }));
      if (!err.fieldErrors && err.code !== 'EMAIL_ALREADY_EXISTS') toast.error(err.message);
    }
  });

  return (
    <div className="auth-page">
      <div className="card auth-card stack">
        <div>
          <h1>Tạo tài khoản</h1>
          <p className="muted text-sm">Tìm phòng, đặt lịch xem và quản lý hợp đồng thuê của bạn.</p>
        </div>
        <form className="stack" onSubmit={onSubmit} noValidate>
          <FormField label="Họ và tên" required error={errors.fullName?.message}>
            <input className="input" autoComplete="name" {...register('fullName')} />
          </FormField>
          <FormField label="Email" required error={errors.email?.message}>
            <input className="input" type="email" autoComplete="email" {...register('email')} />
          </FormField>
          <FormField label="Mật khẩu" required error={errors.password?.message} hint="Từ 12 đến 128 ký tự.">
            <PasswordInput autoComplete="new-password" {...register('password')} />
          </FormField>
          <FormField label="Nhập lại mật khẩu" required error={errors.confirmPassword?.message}>
            <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
          </FormField>
          <div className="field">
            <label className="checkbox">
              <input type="checkbox" {...register('acceptTerms')} aria-invalid={errors.acceptTerms ? true : undefined} />
              <span>
                Tôi đồng ý với <Link to="/help">Điều khoản sử dụng</Link> và <Link to="/help">Chính sách bảo mật</Link>.
              </span>
            </label>
            {errors.acceptTerms && (
              <span className="field__error" role="alert">
                {errors.acceptTerms.message}
              </span>
            )}
          </div>
          <Button type="submit" variant="dark" size="lg" block loading={registerMutation.isPending}>
            Đăng ký
          </Button>
        </form>
        <p className="text-sm muted" style={{ textAlign: 'center' }}>
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}

/** AUTH-03 — phụ thuộc API reset password (chưa chốt luồng). */
export function ForgotPasswordPage() {
  const reset = useRequestPasswordReset();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string }>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await reset.mutateAsync(email);
      setSentTo(email);
    } catch {
      /* hiển thị qua reset.error */
    }
  });

  return (
    <div className="auth-page">
      <div className="card auth-card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1>Quên mật khẩu</h1>
          {env.useMockApi && <MockBadge>Phụ thuộc API</MockBadge>}
        </div>
        {sentTo ? (
          <div className="state" role="status" style={{ padding: 'var(--space-6) 0' }}>
            <div className="state__icon">
              <MailCheck size={26} aria-hidden="true" />
            </div>
            <p className="state__title">Kiểm tra email của bạn</p>
            <p className="state__desc">
              Nếu <strong>{sentTo}</strong> đã đăng ký, bạn sẽ nhận được email chứa liên kết đặt lại mật khẩu. Liên kết chỉ dùng
              được một lần.
            </p>
            {env.useMockApi && (
              <div className="alert alert--info" style={{ textAlign: 'left' }}>
                <span>
                  <MockBadge>Demo</MockBadge> Không có email thật nào được gửi.{' '}
                  <Link to={demoResetLink(sentTo)}>
                    <LinkIcon size={14} aria-hidden="true" /> Mở liên kết đặt lại mật khẩu
                  </Link>
                </span>
              </div>
            )}
            <div className="row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="ghost" size="sm" onClick={() => setSentTo(null)}>
                Gửi lại / đổi email
              </Button>
              <Link to="/login" className="text-sm">
                Quay lại đăng nhập
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className="muted text-sm">Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.</p>
            {reset.error && <div className="alert alert--danger">{toApiError(reset.error).message}</div>}
            <form className="stack" onSubmit={onSubmit} noValidate>
              <FormField label="Email" required error={errors.email?.message}>
                <input className="input" type="email" autoComplete="email" {...register('email')} />
              </FormField>
              <Button type="submit" variant="dark" size="lg" block loading={reset.isPending}>
                Gửi hướng dẫn
              </Button>
            </form>
            <p className="text-sm" style={{ textAlign: 'center' }}>
              <Link to="/login">Quay lại đăng nhập</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Đọc token một lần từ fragment `#token=…` (không gửi tới server); mock demo vẫn dùng `?token=`. */
export function readResetToken(hash: string, search: string): string {
  return new URLSearchParams(hash.replace(/^#/, '')).get('token') ?? new URLSearchParams(search).get('token') ?? '';
}

/** AUTH-04 — mở từ liên kết trong email: /reset-password#token=… */
export function ResetPasswordPage() {
  const location = useLocation();
  const [token] = useState(() => readResetToken(location.hash, location.search));
  const reset = useResetPassword();
  useEffect(() => {
    // Gỡ token khỏi thanh địa chỉ/lịch sử ngay sau khi đã đọc.
    if (location.hash || location.search.includes('token=')) {
      window.history.replaceState(window.history.state, '', location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      await reset.mutateAsync({ token, password });
    } catch {
      /* hiển thị qua reset.error */
    }
  });

  const error = reset.error ? toApiError(reset.error) : null;
  // Token sai/hết hạn/đã dùng (mã PASSWORD_RESET_TOKEN_INVALID) → yêu cầu liên kết mới.
  // 400 VALIDATION_ERROR (mật khẩu chưa hợp lệ) thì ở lại form để sửa.
  const tokenInvalid =
    !token || (error !== null && (error.code === 'PASSWORD_RESET_TOKEN_INVALID' || [404, 410].includes(error.status)));

  return (
    <div className="auth-page">
      <div className="card auth-card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1>Đặt lại mật khẩu</h1>
          {env.useMockApi && <MockBadge>Phụ thuộc API</MockBadge>}
        </div>
        {reset.isSuccess ? (
          <div className="state" role="status" style={{ padding: 'var(--space-6) 0' }}>
            <div className="state__icon">
              <CheckCircle2 size={26} aria-hidden="true" />
            </div>
            <p className="state__title">Đã đổi mật khẩu</p>
            <p className="state__desc">Bạn có thể đăng nhập bằng mật khẩu mới.</p>
            <ButtonLink to="/login" variant="dark" replace>
              Đăng nhập
            </ButtonLink>
          </div>
        ) : tokenInvalid ? (
          <div className="state" role="alert" style={{ padding: 'var(--space-6) 0' }}>
            <div className="state__icon">
              <KeyRound size={26} aria-hidden="true" />
            </div>
            <p className="state__title">Liên kết không hợp lệ hoặc đã hết hạn</p>
            <p className="state__desc">Liên kết đặt lại mật khẩu chỉ dùng được một lần. Vui lòng yêu cầu liên kết mới.</p>
            <Link to="/forgot-password">Gửi lại liên kết đặt lại mật khẩu</Link>
          </div>
        ) : (
          <>
            <p className="muted text-sm">Tạo mật khẩu mới cho tài khoản của bạn.</p>
            {error && (
              <div className="alert alert--danger" role="alert">
                {error.message}
              </div>
            )}
            <form className="stack" onSubmit={onSubmit} noValidate>
              <FormField label="Mật khẩu mới" required error={errors.password?.message} hint="Từ 12 đến 128 ký tự.">
                <PasswordInput autoComplete="new-password" autoFocus {...register('password')} />
              </FormField>
              <FormField label="Nhập lại mật khẩu mới" required error={errors.confirmPassword?.message}>
                <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
              </FormField>
              <Button type="submit" variant="dark" size="lg" block loading={reset.isPending}>
                Đổi mật khẩu
              </Button>
            </form>
            <p className="text-sm" style={{ textAlign: 'center' }}>
              <Link to="/login">Quay lại đăng nhập</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
