import { MessageCircleMore, Send } from "lucide-react";
import Button from "../ui/Button.jsx";
import styles from "./ServicesPageSections.module.css";

export default function ServiceCTA() {
  return <section className={styles.ctaSection} id="service-contact"><div className={`container ${styles.cta}`}><div><span>Tư vấn dịch vụ</span><h2>Bạn cần giải pháp nhập hàng phù hợp?</h2><p>VietTrung Order hỗ trợ bạn tìm hiểu dịch vụ và lựa chọn phương án nhập hàng thuận tiện.</p></div><div><Button href="/#ho-tro" variant="secondary"><MessageCircleMore /> Liên hệ tư vấn</Button><Button href="#top"><Send /> Gửi yêu cầu</Button></div></div></section>;
}
