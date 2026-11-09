import { Layers3 } from "lucide-react";
import { additionalServices } from "../../data/pricingConfig.js";
import styles from "./PricingPage.module.css";

const statusLabels = { contact: "Liên hệ báo giá", unavailable: "Đang cập nhật" };

export default function AdditionalServices() {
  return <section className={styles.additional}><div className={styles.sectionHeading}><span><Layers3 /></span><div><h2>Dịch vụ gia tăng</h2><p>Các dịch vụ tùy chọn được xác nhận theo từng yêu cầu.</p></div></div><div className={styles.additionalGrid}>{additionalServices.map(({ id, title, description, status, price, icon: Icon }) => <article key={id}><span><Icon /></span><div><h3>{title}</h3><p>{description}</p></div><small>{price || statusLabels[status]}</small></article>)}</div></section>;
}
