import { forwardRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, MailCheck } from 'lucide-react';
import { Button, FormField, MockBadge, useToast } from '@/components/ui';
import { useLogin, useRegister, useRequestPasswordReset } from '@/features/auth/hooks';
import { forgotPasswordSchema, loginSchema, registerSchema, type LoginForm, type RegisterForm } from '@/features/auth/schemas';
import { toApiError } from '@/services/http/ApiError';
import { env } from '@/lib/env';
import { landingFor, safeRedirect } from '@/features/auth/landing';

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
      const user = await login.mutateAsync(values);
      navigate(safeRedirect(params.get('redirect')) ?? landingFor(user), { replace: true });
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
          <FormField label="Email hoặc số điện thoại" required error={errors.identifier?.message} hint="Phương thức đăng nhập chính thức sẽ chốt cùng backend.">
            <input className="input" autoComplete="username" {...register('identifier')} />
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
    defaultValues: { fullName: '', email: '', phone: '', password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    const parsed = registerSchema.parse(values);
    try {
      await registerMutation.mutateAsync({
        fullName: parsed.fullName,
        email: parsed.email,
        phone: parsed.phone,
        password: parsed.password,
        acceptTerms: true,
      });
      toast.success('Tạo tài khoản thành công!');
      navigate(safeRedirect(params.get('redirect')) ?? '/', { replace: true });
    } catch (e) {
      const err = toApiError(e);
      Object.entries(err.fieldErrors ?? {}).forEach(([f, m]) => setError(f as keyof RegisterForm, { message: m }));
      if (!err.fieldErrors) toast.error(err.message);
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
          <FormField label="Số điện thoại" required error={errors.phone?.message}>
            <input className="input" type="tel" autoComplete="tel" {...register('phone')} />
          </FormField>
          <FormField label="Mật khẩu" required error={errors.password?.message} hint="Tối thiểu 8 ký tự, gồm chữ và số.">
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
    await reset.mutateAsync(email);
    setSentTo(email);
  });

  return (
    <div className="auth-page">
      <div className="card auth-card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1>Quên mật khẩu</h1>
          <MockBadge>Phụ thuộc API</MockBadge>
        </div>
        {sentTo ? (
          <div className="state" role="status" style={{ padding: 'var(--space-6) 0' }}>
            <div className="state__icon">
              <MailCheck size={26} aria-hidden="true" />
            </div>
            <p className="state__title">Kiểm tra email của bạn</p>
            <p className="state__desc">
              Nếu <strong>{sentTo}</strong> đã đăng ký, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu. (Bản demo: không có email nào được gửi.)
            </p>
            <Link to="/login">Quay lại đăng nhập</Link>
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
