import { oauthProviders } from "../../config/oauthProviders.js";
import styles from "./LoginPage.module.css";

function GoogleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.24-.2-1.79H12v3.4h5.52a4.72 4.72 0 0 1-2.05 3.1l-.02.11 2.97 2.3.2.02c1.84-1.7 2.98-4.2 2.98-7.14Z"/><path fill="#34A853" d="M12 22c2.69 0 4.94-.89 6.59-2.42l-3.14-2.43c-.84.57-1.98.97-3.45.97a5.99 5.99 0 0 1-5.67-4.14l-.1.01-3.09 2.4-.04.09A9.96 9.96 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.33 13.98A6.13 6.13 0 0 1 6 12c0-.69.12-1.36.32-1.98v-.12L3.2 7.47l-.1.05A10.02 10.02 0 0 0 2 12c0 1.61.38 3.13 1.1 4.48l3.23-2.5Z"/><path fill="#EA4335" d="M12 5.88c1.87 0 3.13.81 3.85 1.47l2.8-2.74C16.93 3.01 14.69 2 12 2a9.96 9.96 0 0 0-8.9 5.52l3.22 2.5A6.01 6.01 0 0 1 12 5.88Z"/></svg>;
}

function FacebookIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#1877F2"/><path fill="#fff" d="M13.55 22v-7.73h2.6l.39-3.02h-2.99V9.32c0-.87.24-1.47 1.5-1.47h1.6v-2.7A21.4 21.4 0 0 0 14.32 5c-2.3 0-3.88 1.4-3.88 3.98v2.27H7.83v3.02h2.61V22h3.11Z"/></svg>;
}

function AppleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.05 12.54c-.03-3.06 2.5-4.55 2.62-4.62a5.63 5.63 0 0 0-4.43-2.4c-1.86-.2-3.67 1.11-4.62 1.11-.97 0-2.44-1.09-4.03-1.05A5.87 5.87 0 0 0 1.66 8.6c-2.14 3.7-.55 9.15 1.5 12.14 1.03 1.47 2.23 3.1 3.82 3.04 1.55-.06 2.13-.98 4-.98 1.84 0 2.39.98 4 .94 1.67-.02 2.72-1.47 3.71-2.95a12.1 12.1 0 0 0 1.7-3.46 5.28 5.28 0 0 1-3.34-4.8ZM14.02 3.55A5.35 5.35 0 0 0 15.24-.28a5.46 5.46 0 0 0-3.54 1.82 5.08 5.08 0 0 0-1.25 3.7 4.5 4.5 0 0 0 3.57-1.69Z" transform="translate(1 1) scale(.88)"/></svg>;
}

const providerIcons = {
  google: GoogleIcon,
  facebook: FacebookIcon,
  apple: AppleIcon,
};

function isValidAuthUrl(provider) {
  if (typeof provider.authUrl !== "string") return false;
  return provider.authUrl.startsWith("/") || /^https:\/\//i.test(provider.authUrl);
}

export default function SocialAuthButtons({ mode = "login" }) {
  const actionLabel = mode === "register" ? "đăng ký" : "đăng nhập";
  const titleId = `social-${mode}-title`;
  return <section className={styles.socialLogin} aria-labelledby={titleId}><div className={styles.divider}><span id={titleId}>Hoặc {actionLabel} bằng</span></div><div className={styles.socials}>{oauthProviders.map((provider) => {
    const Icon = providerIcons[provider.id];
    const available = provider.supported && isValidAuthUrl(provider);
    const content = <><Icon/><span><strong>{provider.label}</strong>{!available && <small>Sắp hỗ trợ</small>}</span></>;
    if (!available) return <button type="button" disabled aria-label={`${provider.label} - Sắp hỗ trợ`} key={provider.id}>{content}</button>;
    return <a href={provider.authUrl} aria-label={`${actionLabel} bằng ${provider.label}`} key={provider.id}>{content}</a>;
  })}</div></section>;
}
