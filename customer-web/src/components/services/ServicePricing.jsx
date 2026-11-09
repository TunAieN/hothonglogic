import { ArrowRight } from "lucide-react";
import { servicePricing } from "../../data/servicePage.js";
import styles from "./ServicesPageSections.module.css";

export default function ServicePricing() {
  return <section className={`section ${styles.pricing}`} id="bang-gia"><div className={`container ${styles.pricingLayout}`}><div className={styles.sideHeading}><span className="sectionEyebrow">Bảng giá dịch vụ</span><h2 className="sectionTitle">Chi phí rõ ràng, minh bạch</h2><p className="sectionDescription">Mức phí chỉ được hiển thị khi có dữ liệu và chính sách đã xác minh.</p><a href="#service-contact">Yêu cầu báo giá <ArrowRight /></a></div><div className={styles.pricingGrid}>{servicePricing.map(({ id, title, description, value, icon: Icon }) => <article key={id}><span><Icon /></span><h3>{title}</h3><strong>{value || "Liên hệ báo giá"}</strong><p>{description}</p><a href="#service-contact">Nhận tư vấn <ArrowRight /></a></article>)}</div></div></section>;
}
