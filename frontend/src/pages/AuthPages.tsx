import { FormEvent, ReactNode, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, authApi } from "../lib/api";

type FieldErrors = Record<string, string>;

function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <div className="story-copy">
          <p className="eyebrow">Care, made simple</p>
          <h1>Your health deserves a calmer experience.</h1>
          <p>Find the right care, keep appointments organized, and stay connected to your healthcare journey.</p>
          <ul className="benefit-list">
            <li><span>✓</span> Find doctors who fit your needs</li>
            <li><span>✓</span> Manage your care in one place</li>
            <li><span>✓</span> Feel informed at every step</li>
          </ul>
        </div>
        <div className="story-mark" aria-hidden="true"><span>+</span></div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="muted auth-subtitle">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  value,
  onChange,
  error,
  required = true,
  autoComplete,
  placeholder,
  inputMode,
  maxLength,
  onInput,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  inputMode?: "numeric" | "text" | "email" | "tel" | "url" | "search" | "decimal" | "none";
  maxLength?: number;
  onInput?: (value: string) => string;
}) {
  const id = `field-${name}`;
  return (
    <label className={`field${error ? " has-error" : ""}`} htmlFor={id}>
      <span>{label}{required && <b aria-hidden="true"> *</b>}</span>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={onChange ? (event) => onChange(onInput ? onInput(event.target.value) : event.target.value) : undefined}
      />
      {error && <small id={`${id}-error`} className="field-error" role="alert">{error}</small>}
    </label>
  );
}

function PasswordField({ name, label, error, value, onChange }: { name: string; label: string; error?: string; value?: string; onChange?: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  const id = `field-${name}`;
  return (
    <label className={`field${error ? " has-error" : ""}`} htmlFor={id}>
      <span>{label}<b aria-hidden="true"> *</b></span>
      <span className="password-input">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          minLength={8}
          autoComplete={name === "password" ? "current-password" : "new-password"}
          value={value}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button type="button" className="password-toggle" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"}>
          {visible ? "Hide" : "Show"}
        </button>
      </span>
      {error && <small id={`${id}-error`} className="field-error" role="alert">{error}</small>}
    </label>
  );
}

function errorsFromApi(error: unknown): { form: string; fields: FieldErrors } {
  if (error instanceof ApiError) {
    const fields: FieldErrors = {};
    error.details?.forEach((detail) => {
      if (detail.path[0]) fields[detail.path[0]] = detail.message;
    });
    if (error.status === 409 && !Object.keys(fields).length) {
      fields.email = "This email is already registered. Please log in or use another email.";
    }
    return { form: Object.keys(fields).length ? "Please correct the highlighted fields and try again." : error.message, fields };
  }
  return { form: "We couldn't complete your request. Please try again.", fields: {} };
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await login(String(data.get("email")).trim(), String(data.get("password")));
      navigate((location.state as { from?: string })?.from || "/dashboard");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "The email or password doesn’t match our records." : errorsFromApi(err).form);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout eyebrow="Welcome back" title="Sign in to your care" subtitle="Pick up where you left off and keep your healthcare organized.">
      <form onSubmit={submit} noValidate>
        {error && <div className="alert error" role="alert"><strong>We couldn’t sign you in</strong><span>{error}</span></div>}
        <Field label="Email address" name="email" type="email" autoComplete="email" />
        <PasswordField label="Password" name="password" />
        <div className="form-row"><label className="checkbox"><input type="checkbox" /> Remember me</label><Link to="/forgot-password">Forgot password?</Link></div>
        <button className="button full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="auth-footer">New here? <Link to="/register">Create an account</Link></p>
    </AuthLayout>
  );
}

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [fields, setFields] = useState<FieldErrors>({});
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFields({});
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const values = Object.fromEntries(data);
    const payload: Record<string, unknown> = {
      firstName: String(values.firstName || "").trim(),
      lastName: String(values.lastName || "").trim(),
      email: String(values.email || "").trim(),
      phone: String(values.phone || "").trim() || undefined,
      iin: String(values.iin || "").replace(/\D/g, ""),
      password: String(values.password || ""),
    };
    const next: FieldErrors = {};
    ["firstName", "lastName", "email", "iin"].forEach((field) => {
      if (!String(payload[field] || "").trim()) {
        next[field] = field === "firstName"
          ? "First name is required."
          : field === "lastName"
            ? "Last name is required."
            : field === "email"
              ? "Email address is required."
              : "IIN is required.";
      }
    });
    if (payload.iin && !/^\d{12}$/.test(String(payload.iin))) next.iin = "IIN must contain exactly 12 digits.";
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.email))) next.email = "Enter a valid email address.";
    if (payload.phone && !/^[+()\d\s-]{7,30}$/.test(String(payload.phone))) next.phone = "Enter a valid phone number.";
    if (String(payload.password || "").length < 8) next.password = "Password must contain at least 8 characters.";
    if (Object.keys(next).length) {
      setFields(next);
      setError("Please correct the highlighted fields and try again.");
      setBusy(false);
      return;
    }
    try {
      await register(payload);
      setSuccess(true);
      window.setTimeout(() => navigate("/dashboard"), 1200);
    } catch (err) {
      const result = errorsFromApi(err);
      setError(result.form);
      setFields(result.fields);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout eyebrow="Get started" title="Create your account" subtitle="A simple, secure home for your healthcare journey.">
      {success ? (
        <div className="success-state" role="status"><div className="success-icon">✓</div><h3>Account created successfully</h3><p>Your account is ready. Taking you to your dashboard…</p></div>
      ) : (
        <form onSubmit={submit} noValidate>
          {error && <div className="alert error" role="alert"><strong>Registration could not be completed</strong><span>{error}</span></div>}
          <div className="two-col"><Field label="First name" name="firstName" autoComplete="given-name" error={fields.firstName} /><Field label="Last name" name="lastName" autoComplete="family-name" error={fields.lastName} /></div>
          <Field label="IIN" name="iin" inputMode="numeric" maxLength={12} onInput={(value) => value.replace(/\D/g, "").slice(0, 12)} error={fields.iin} />
          <Field label="Email address" name="email" type="email" autoComplete="email" error={fields.email} />
          <Field label="Phone number" name="phone" required={false} autoComplete="tel" error={fields.phone} />
          <PasswordField label="Password" name="password" error={fields.password} />
          <label className="checkbox terms"><input type="checkbox" required /> I agree to the terms and privacy policy</label>
          <button className="button full" disabled={busy}>{busy ? "Creating your account…" : "Create account"}</button>
        </form>
      )}
      <p className="auth-footer">Already have an account? <Link to="/login">Sign in</Link></p>
    </AuthLayout>
  );
}

export function Forgot() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await authApi.forgot(email);
      setMessage(result.message);
      if (result.devResetToken) setToken(result.devResetToken);
    } catch (err) {
      setMessage(errorsFromApi(err).form);
    }
  }
  return <AuthLayout eyebrow="Account access" title="Reset your password" subtitle="Enter your email and we’ll help you get back in."><form onSubmit={submit} noValidate>{message && <div className="alert success" role="status">{message}{token && <><br /><Link to={`/reset-password?token=${token}`}>Continue to reset password →</Link></>}</div>}<Field label="Email address" name="email" type="email" required value={email} onChange={setEmail} autoComplete="email" /><button className="button full">Send reset link</button></form><p className="auth-footer"><Link to="/login">← Back to sign in</Link></p></AuthLayout>;
}

export function Reset() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await authApi.reset({ token: params.get("token") || "", password });
      setMessage(result.message);
    } catch (err) {
      setMessage(errorsFromApi(err).form);
    }
  }
  return <AuthLayout eyebrow="Account access" title="Choose a new password" subtitle="Make it strong and easy for you to remember."><form onSubmit={submit} noValidate>{message && <div className="alert success" role="status">{message} <Link to="/login">Sign in</Link></div>}<PasswordField label="New password" name="password" value={password} onChange={setPassword} /><button className="button full">Reset password</button></form></AuthLayout>;
}
