import {useState} from 'react';
import {
  Headphones,
  Menu,
  X,
  UserRound
} from "lucide-react";
import styles from './Header.module.css';

const navigation = [
    { label: "Trang chủ", href: "/" },
  { label: "Hướng dẫn", href: "/huong-dan" },
  { label: "Bảng giá", href: "/bang-gia" },
  { label: "Dịch vụ", href: "/dich-vu" },
  { label: "Tra cứu đơn", href: "/tra-cuu" },
  { label: "Tin tức", href: "/tin-tuc" }
];

function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>

        <a href="/" className={styles.logo}>
          <span className={styles.logoSymbol}>V</span>

          <span className={styles.logoText}>
            <strong>VietTrung Order</strong>
            <small>Kết nối hàng Trung - Gần hơn với bạn</small>
          </span>
        </a>

        <nav
          id="site-navigation"
          className={`${styles.navigation} ${
            isMenuOpen ? styles.navigationOpen : ""
          }`}
          aria-label="Điều hướng chính"
        >
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={
                item.href === "/" ? styles.active : ""
              }
              aria-current={
                item.href === "/" ? "page" : undefined
              }
              onClick={() => setIsMenuOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className={styles.actions}>
          <a
            className={styles.support}
            href="/ho-tro"
          >
            <Headphones size={18} />
            <span>Hỗ trợ 24/7</span>
          </a>

          <a
            className={styles.login}
            href="/dang-nhap"
          >
            <UserRound size={17} />
            <span>Đăng nhập</span>
          </a>

          <a
            className={styles.register}
            href="/dang-ky"
          >
            Đăng ký
          </a>
        </div>

        <button
          type="button"
          className={styles.menuButton}
          aria-label={isMenuOpen ? "Đóng menu" : "Mở menu"}
          aria-expanded={isMenuOpen}
          aria-controls="site-navigation"
          onClick={() => setIsMenuOpen((previous) => !previous)}
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

      </div>
    </header>
  );
}

export default Header;