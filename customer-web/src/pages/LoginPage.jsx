import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import Header from "../components/layout/Header.jsx";
import Footer from "../components/layout/Footer.jsx";
import AuthLayout from "../components/auth/AuthLayout.jsx";
import SocialAuthButtons from "../components/auth/SocialLogin.jsx";
import { CustomerAuthError, loginCustomer } from "../api/customerAuth.js";
import styles from "../components/auth/LoginPage.module.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const normalizedEmail = email.trim();
    const nextErrors = {};
    if (!normalizedEmail) nextErrors.email = "Vui lòng nhập email đăng nhập.";
    else if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) nextErrors.email = "Email chưa đúng định dạng.";
    if (!password) nextErrors.password = "Vui lòng nhập mật khẩu.";

    setErrors(nextErrors);
    setFeedback("");
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      await loginCustomer({ email: normalizedEmail, password });
    } catch (error) {
      setFeedback(error instanceof CustomerAuthError ? error.message : "Không thể kết nối dịch vụ đăng nhập. Vui lòng thử lại sau.");
    } finally {
      setSubmitting(false);
    }
  };

  return <><Header/><AuthLayout><div className={styles.formSide}><div className={styles.formHeading}><h2>Đăng nhập</h2><p>Chào mừng bạn quay trở lại VietTrung Order!</p></div><form onSubmit={submit} noValidate aria-busy={submitting}><label htmlFor="login-email">Email</label><div className={`${styles.inputGroup} ${errors.email ? styles.inputError : ""}`}><Mail/><input id="login-email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setErrors((value) => ({ ...value, email: "" })); setFeedback(""); }} placeholder="Nhập email của bạn" autoComplete="email" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "login-email-error" : undefined}/></div>{errors.email && <p className={styles.fieldError} id="login-email-error">{errors.email}</p>}<label htmlFor="login-password">Mật khẩu</label><div className={`${styles.inputGroup} ${errors.password ? styles.inputError : ""}`}><LockKeyhole/><input id="login-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); setErrors((value) => ({ ...value, password: "" })); setFeedback(""); }} placeholder="Nhập mật khẩu" autoComplete="current-password" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "login-password-error" : undefined}/><button type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff/> : <Eye/>}</button></div>{errors.password && <p className={styles.fieldError} id="login-password-error">{errors.password}</p>}<button className={styles.submit} type="submit" disabled={submitting}>{submitting ? <><span className={styles.spinner}/>Đang kiểm tra...</> : <>Đăng nhập <ArrowRight/></>}</button>{feedback && <p className={styles.feedback} role="alert">{feedback}</p>}</form><SocialAuthButtons/><p className={styles.registerPrompt}>Chưa có tài khoản? <a href="/dang-ky">Đăng ký ngay</a></p></div></AuthLayout><Footer/></>;
}
