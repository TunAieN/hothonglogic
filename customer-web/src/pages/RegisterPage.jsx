import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Phone, UserRound } from "lucide-react";
import Header from "../components/layout/Header.jsx";
import Footer from "../components/layout/Footer.jsx";
import AuthLayout from "../components/auth/AuthLayout.jsx";
import SocialAuthButtons from "../components/auth/SocialLogin.jsx";
import { CustomerAuthError, registerCustomer } from "../api/customerAuth.js";
import { customerRegistrationRules } from "../config/customerRegistration.js";
import styles from "../components/auth/LoginPage.module.css";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "", passwordConfirmation: "", acceptedTerms: false });
  const [visible, setVisible] = useState({ password: false, passwordConfirmation: false });
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setFeedback("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const name = form.name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();
    const nextErrors = {};
    if (!name) nextErrors.name = "Vui lòng nhập họ và tên.";
    if (!phone) nextErrors.phone = "Vui lòng nhập số điện thoại.";
    else if (!customerRegistrationRules.phonePattern.test(phone)) nextErrors.phone = "Số điện thoại không đúng định dạng hỗ trợ.";
    if (!email) nextErrors.email = "Vui lòng nhập email.";
    else if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Email không đúng định dạng.";
    if (!form.password) nextErrors.password = "Vui lòng nhập mật khẩu.";
    else if (customerRegistrationRules.passwordMinLength && form.password.length < customerRegistrationRules.passwordMinLength) nextErrors.password = `Mật khẩu cần có ít nhất ${customerRegistrationRules.passwordMinLength} ký tự.`;
    if (!form.passwordConfirmation) nextErrors.passwordConfirmation = "Vui lòng xác nhận mật khẩu.";
    else if (form.passwordConfirmation !== form.password) nextErrors.passwordConfirmation = "Mật khẩu xác nhận không khớp.";
    if (!form.acceptedTerms) nextErrors.acceptedTerms = "Vui lòng đồng ý với điều khoản sử dụng.";

    setErrors(nextErrors);
    setFeedback("");
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      await registerCustomer({ name, phone, email, password: form.password });
    } catch (error) {
      setFeedback(error instanceof CustomerAuthError ? error.message : "Không thể kết nối dịch vụ đăng ký. Vui lòng thử lại sau.");
    } finally {
      setSubmitting(false);
    }
  };

  const passwordInput = (field, label, placeholder) => <div className={styles.field}><label htmlFor={`register-${field}`}>{label}</label><div className={`${styles.inputGroup} ${errors[field] ? styles.inputError : ""}`}><LockKeyhole/><input id={`register-${field}`} type={visible[field] ? "text" : "password"} value={form[field]} onChange={(event) => update(field, event.target.value)} placeholder={placeholder} autoComplete={field === "password" ? "new-password" : "new-password"} aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `register-${field}-error` : undefined}/><button type="button" aria-label={visible[field] ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`} aria-pressed={visible[field]} onClick={() => setVisible((current) => ({ ...current, [field]: !current[field] }))}>{visible[field] ? <EyeOff/> : <Eye/>}</button></div>{errors[field] && <p className={styles.fieldError} id={`register-${field}-error`}>{errors[field]}</p>}</div>;

  return <><Header/><AuthLayout><div className={`${styles.formSide} ${styles.registerSide}`}><div className={styles.formHeading}><h2>Đăng ký tài khoản</h2><p>Chỉ vài bước đơn giản để bắt đầu nhập hàng cùng VietTrung Order!</p></div><form className={styles.registerForm} onSubmit={submit} noValidate aria-busy={submitting}><div className={styles.fieldRow}><div className={styles.field}><label htmlFor="register-name">Họ và tên</label><div className={`${styles.inputGroup} ${errors.name ? styles.inputError : ""}`}><UserRound/><input id="register-name" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Nhập họ và tên" autoComplete="name" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "register-name-error" : undefined}/></div>{errors.name && <p className={styles.fieldError} id="register-name-error">{errors.name}</p>}</div><div className={styles.field}><label htmlFor="register-phone">Số điện thoại</label><div className={`${styles.inputGroup} ${errors.phone ? styles.inputError : ""}`}><Phone/><input id="register-phone" type="tel" inputMode="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="Nhập số điện thoại" autoComplete="tel" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "register-phone-error" : "register-phone-hint"}/></div>{errors.phone ? <p className={styles.fieldError} id="register-phone-error">{errors.phone}</p> : <p className={styles.fieldHint} id="register-phone-hint">{customerRegistrationRules.phoneHint}</p>}</div></div><div className={styles.field}><label htmlFor="register-email">Email</label><div className={`${styles.inputGroup} ${errors.email ? styles.inputError : ""}`}><Mail/><input id="register-email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="Nhập email của bạn" autoComplete="email" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "register-email-error" : undefined}/></div>{errors.email && <p className={styles.fieldError} id="register-email-error">{errors.email}</p>}</div>{passwordInput("password", "Mật khẩu", "Tạo mật khẩu")}{passwordInput("passwordConfirmation", "Xác nhận mật khẩu", "Nhập lại mật khẩu")}<div className={styles.terms}><label className={styles.checkbox}><input type="checkbox" checked={form.acceptedTerms} onChange={(event) => update("acceptedTerms", event.target.checked)} aria-invalid={Boolean(errors.acceptedTerms)} aria-describedby={errors.acceptedTerms ? "register-terms-error" : "register-terms-note"}/><span/>Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật.</label>{!customerRegistrationRules.legalDocumentsAvailable && <small id="register-terms-note">Tài liệu pháp lý chính thức đang được cập nhật.</small>}{errors.acceptedTerms && <p className={styles.fieldError} id="register-terms-error">{errors.acceptedTerms}</p>}</div><button className={styles.submit} type="submit" disabled={submitting}>{submitting ? <><span className={styles.spinner}/>Đang kiểm tra...</> : <>Đăng ký tài khoản <ArrowRight/></>}</button>{feedback && <p className={styles.feedback} role="alert">{feedback}</p>}</form><SocialAuthButtons mode="register"/><p className={styles.registerPrompt}>Đã có tài khoản? <a href="/dang-nhap">Đăng nhập ngay</a></p></div></AuthLayout><Footer/></>;
}
