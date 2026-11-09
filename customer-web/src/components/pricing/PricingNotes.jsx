import { FileWarning } from "lucide-react";
import { pricingNotes } from "../../data/pricingConfig.js";
import styles from "./PricingPage.module.css";

export default function PricingNotes() {
  return <section className={`section ${styles.notes}`}><div className="container"><div className={styles.sectionHeading}><span><FileWarning /></span><div><h2>Lưu ý quan trọng và chính sách</h2><p>Các quy định chi tiết cần được lấy từ chính sách đang áp dụng.</p></div></div><div className={styles.notesGrid}>{pricingNotes.map(({ id, title, description, icon: Icon }) => <article key={id}><span><Icon /></span><div><h3>{title}</h3><p>{description}</p><a href="/#ho-tro">Yêu cầu thông tin chính sách</a></div></article>)}</div></div></section>;
}
