import { MessageCircleMore, Send } from "lucide-react";
import Button from "../ui/Button.jsx";
import styles from "./PricingPage.module.css";

export default function PricingCTA() {
  return <section className={styles.ctaSection} id="pricing-contact"><div className={`container ${styles.cta}`}><div><span>Hỗ trợ báo giá</span><h2>Bạn cần báo giá phù hợp với đơn hàng?</h2><p>Gửi nhu cầu nhập hàng hoặc liên hệ VietTrung Order để được tư vấn phương án phù hợp.</p></div><div><Button href="/dich-vu#top" variant="secondary"><Send /> Tạo yêu cầu</Button><Button href="/#ho-tro" className={styles.outlineButton}><MessageCircleMore /> Liên hệ tư vấn</Button></div></div></section>;
}
