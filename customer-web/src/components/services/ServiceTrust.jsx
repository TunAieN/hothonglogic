import { warehousePlaceholders, serviceTrustPoints } from "../../data/servicePage.js";
import ImageSlot from "../ui/ImageSlot.jsx";
import styles from "./ServicesPageSections.module.css";

export default function ServiceTrust() {
  return <section className={`section ${styles.trust}`}><div className="container"><div className={styles.trustHeading}><span className="sectionEyebrow">Khách hàng &amp; hệ thống kho</span><h2 className="sectionTitle">Niềm tin được xây dựng từ sự minh bạch</h2><p className="sectionDescription">Không hiển thị đánh giá, địa chỉ hoặc quy mô kho khi chưa có dữ liệu chính thức.</p></div><div className={styles.trustLayout}><div className={styles.feedbackEmpty}><span>Dữ liệu phản hồi</span><h3>Chưa có đánh giá đã xác minh</h3><p>Khu vực này đã sẵn sàng nhận dữ liệu feedback thật từ backend hoặc CMS. Không sử dụng người dùng, số sao hay nhận xét giả.</p><div>{serviceTrustPoints.map(({ title, description, icon: Icon }) => <article key={title}><Icon /><div><strong>{title}</strong><small>{description}</small></div></article>)}</div></div><div className={styles.warehouseTrack}>{warehousePlaceholders.map(({ id, title, description, image }) => <article key={id}><div><ImageSlot src={image} alt={`Hình ảnh ${title}`} label={`Ảnh ${title}`} /></div><h3>{title}</h3><p>{description}</p></article>)}</div></div></div></section>;
}
