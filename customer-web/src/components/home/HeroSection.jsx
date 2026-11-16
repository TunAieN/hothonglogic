import { ArrowRight, CheckCircle2, CirclePlay, Package, ShieldCheck, Truck } from "lucide-react";
import Button from "../ui/Button.jsx";
import HeroSlider from "./HeroSlider.jsx";
import styles from "./HeroSection.module.css";

export default function HeroSection() {
  return <section className={styles.hero} id="top" aria-labelledby="hero-title"><HeroSlider><div className={styles.copy}><span className={styles.badge}><Package size={15} aria-hidden="true" /> Giải pháp nhập hàng Trung Quốc toàn diện</span><h1 id="hero-title">Đặt hàng Trung Quốc<br />dễ dàng, minh bạch,<br /><em>theo dõi mọi chặng</em></h1><p>VietTrung Order giúp bạn quản lý yêu cầu mua hàng, kho vận, thanh toán và theo dõi hành trình từ Trung Quốc về Việt Nam.</p><div className={styles.ctas}><Button href="#dich-vu">Bắt đầu khám phá <ArrowRight size={17} aria-hidden="true" /></Button><Button href="#quy-trinh" variant="secondary" className={styles.secondaryCta}><CirclePlay size={17} aria-hidden="true" /> Xem hướng dẫn</Button></div><ul aria-label="Lợi ích nổi bật"><li><CheckCircle2 aria-hidden="true" />Dễ sử dụng</li><li><ShieldCheck aria-hidden="true" />Quy trình rõ ràng</li><li><Truck aria-hidden="true" />Theo dõi thuận tiện</li></ul></div></HeroSlider></section>;
}
