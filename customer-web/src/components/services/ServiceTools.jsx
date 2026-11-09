import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { serviceTools } from "../../data/servicePage.js";
import styles from "./ServicesPageSections.module.css";

export default function ServiceTools() {
  const [amount, setAmount] = useState("");
  return <section className={`section ${styles.tools}`}><div className="container"><div className={styles.toolsHeading}><span className="sectionEyebrow">Công cụ hỗ trợ</span><h2 className="sectionTitle">Bộ công cụ nhập hàng thông minh</h2><p className="sectionDescription">Các tiện ích được trình bày đúng theo khả năng hiện có và sẵn sàng kết nối dữ liệu sau này.</p></div><div className={styles.toolsGrid}>{serviceTools.map(({ id, title, description, icon: Icon, tone }) => <article className={tone === "featured" ? styles.featuredTool : ""} key={id}><span><Icon /></span><h3>{title}</h3><p>{description}</p>{id === "extension" && <small>Liên kết cài đặt chính thức chưa được cấu hình.</small>}{id === "calculator" && <div className={styles.calculator}><label htmlFor="cny-amount">Số tiền CNY</label><input id="cny-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.,]/g, ""))} placeholder="Nhập số tiền" /><output>{amount ? "Chưa có tỷ giá để quy đổi" : "Kết quả sẽ hiển thị tại đây"}</output></div>}{id === "tracking" && <a href="/#tra-cuu">Đến khu tra cứu <ArrowRight /></a>}</article>)}</div></div></section>;
}
