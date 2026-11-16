import { useState } from "react";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import Header from "../components/layout/Header.jsx";
import Footer from "../components/layout/Footer.jsx";
import AuthLayout from "../components/auth/AuthLayout.jsx";
import { CustomerAuthError, forgotCustomerPassword, resetCustomerPassword } from "../api/customerAuth.js";
import styles from "../components/auth/LoginPage.module.css";

export default function AuthRecoveryPage({ reset = false }) {
  const params = new URLSearchParams(window.location.search);
  const [email, setEmail] = useState(params.get("email") || "");
  const [token, setToken] = useState(params.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setSubmitting(true); setFeedback("");
    try {
      const result = reset ? await resetCustomerPassword({ email, token, password, password_confirmation: confirmation }) : await forgotCustomerPassword(email);
      setFeedback(result.message);
    } catch (error) {
      setFeedback(error instanceof CustomerAuthError ? error.message : "Không thể kết nối dịch vụ. Vui lòng thử lại sau.");
    } finally { setSubmitting(false); }
  };
  return <><Header/><AuthLayout><div className={styles.formSide}><div className={styles.formHeading}><h2>{reset ? "Đặt lại mật khẩu" : "Quên mật khẩu"}</h2><p>{reset ? "Tạo mật khẩu mới an toàn cho tài khoản." : "Chúng tôi sẽ gửi hướng dẫn nếu email phù hợp tồn tại."}</p></div><form onSubmit={submit}><label htmlFor="recovery-email">Email</label><div className={styles.inputGroup}><Mail/><input id="recovery-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>{reset && <><label htmlFor="recovery-token">Mã đặt lại</label><div className={styles.inputGroup}><LockKeyhole/><input id="recovery-token" value={token} onChange={(event) => setToken(event.target.value)} required /></div><label htmlFor="recovery-password">Mật khẩu mới</label><div className={styles.inputGroup}><LockKeyhole/><input id="recovery-password" type="password" minLength="12" value={password} onChange={(event) => setPassword(event.target.value)} required /></div><label htmlFor="recovery-confirmation">Xác nhận mật khẩu</label><div className={styles.inputGroup}><LockKeyhole/><input id="recovery-confirmation" type="password" minLength="12" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></div></>}<button className={styles.submit} disabled={submitting}>{submitting ? "Đang xử lý..." : <>{reset ? "Đặt lại mật khẩu" : "Gửi hướng dẫn"}<ArrowRight/></>}</button>{feedback && <p className={styles.feedback} role="status">{feedback}</p>}</form><p className={styles.registerPrompt}><a href="/dang-nhap">Quay lại đăng nhập</a></p></div></AuthLayout><Footer/></>;
}
