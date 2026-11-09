import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import styles from "./Header.module.css";

const navigation = [
  ["Trang chủ", "/"],
  ["Dịch vụ", "/dich-vu"],
  ["Bảng giá", "/bang-gia"],
  ["Giới thiệu", "/gioi-thieu"],
  ["Hướng dẫn", "/huong-dan"],
  ["Câu hỏi thường gặp", "/#faq"],
];

export default function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href) => {
    if (href.includes("#")) return false;
    const targetPath = href.split("#")[0] || "/";
    return targetPath === pathname || (targetPath !== "/" && pathname.startsWith(`${targetPath}/`));
  };

  return <header className={`${styles.header} ${scrolled ? styles.scrolled : ""}`}><div className={`container ${styles.inner}`}><a href="/#top" className={styles.logo} aria-label="VietTrung Order - Trang chủ"><span className={styles.mark}>V</span><strong>VietTrung Order</strong></a><nav id="main-nav" className={`${styles.nav} ${open ? styles.open : ""}`} aria-label="Điều hướng chính">{navigation.map(([label, href]) => <a key={label} href={href} className={isActive(href) ? styles.active : ""} aria-current={isActive(href) ? "page" : undefined} onClick={() => setOpen(false)}>{label}</a>)}<div className={styles.mobileActions}><a href="/dang-nhap" aria-current={pathname === "/dang-nhap" ? "page" : undefined}>Đăng nhập</a><a href="/dang-ky" className={styles.register} aria-current={pathname === "/dang-ky" ? "page" : undefined}>Đăng ký</a></div></nav><div className={styles.actions}><a href="/dang-nhap" className={pathname === "/dang-nhap" ? styles.actionActive : ""} aria-current={pathname === "/dang-nhap" ? "page" : undefined}>Đăng nhập</a><a href="/dang-ky" className={styles.register} aria-current={pathname === "/dang-ky" ? "page" : undefined}>Đăng ký</a></div><button className={styles.menu} type="button" aria-expanded={open} aria-controls="main-nav" aria-label={open ? "Đóng menu" : "Mở menu"} onClick={() => setOpen((value) => !value)}>{open ? <X /> : <Menu />}</button></div></header>;
}
