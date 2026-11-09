import { Boxes, Headphones, Layers3, MapPinned } from "lucide-react";
import styles from "./BenefitsBar.module.css";
const items=[[Layers3,"Nguồn hàng đa nền tảng","Sẵn sàng mở rộng"],[Boxes,"Hỗ trợ kho Trung Quốc","Tiếp nhận và gom kiện"],[MapPinned,"Theo dõi đơn hàng","Nắm rõ từng chặng"],[Headphones,"Hỗ trợ khách hàng","Đồng hành khi xử lý"]];
export default function BenefitsBar(){return <section className={styles.wrap} aria-label="Thông tin nổi bật"><div className={`container ${styles.bar}`}>{items.map(([Icon,title,text])=><div key={title}><span><Icon/></span><p><strong>{title}</strong><small>{text}</small></p></div>)}</div></section>}
