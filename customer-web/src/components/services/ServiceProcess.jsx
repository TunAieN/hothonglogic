import { serviceProcess } from "../../data/servicePage.js";
import styles from "./ServicesPageSections.module.css";

export default function ServiceProcess() {
  return <section className={`section ${styles.process}`} id="quy-trinh-dich-vu"><div className="container"><div className={styles.processHeading}><span className="sectionEyebrow">Quy trình dịch vụ</span><h2 className="sectionTitle">Nhập hàng dễ dàng chỉ với 4 bước</h2><p className="sectionDescription">Extension hỗ trợ các nguồn tương thích; những nguồn khác vẫn có thể gửi yêu cầu trực tiếp.</p></div><ol>{serviceProcess.map(({ title, description, icon: Icon }, index) => <li key={title}><span className={styles.stepIcon}><Icon /></span><b>0{index + 1}</b><h3>{title}</h3><p>{description}</p></li>)}</ol></div></section>;
}
