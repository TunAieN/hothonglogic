import { useState } from "react";
import { Boxes, CheckCircle2, Link2, MapPinned, Send, ShoppingBag } from "lucide-react";
import Button from "../ui/Button.jsx";
import ImageSlot from "../ui/ImageSlot.jsx";
import styles from "./ServicesPageSections.module.css";

const heroHighlights = ["Tiếp nhận đa nguồn", "Quản lý tập trung", "Theo dõi từng chặng"];

export default function ServicesHero() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [feedback, setFeedback] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();
    const value = sourceUrl.trim();

    if (!value) {
      setFeedback("Vui lòng nhập link nguồn hàng cần tư vấn.");
      return;
    }

    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid protocol");
    } catch {
      setFeedback("Link cần bắt đầu bằng http:// hoặc https:// và có định dạng hợp lệ.");
      return;
    }

    setFeedback("Tính năng gửi yêu cầu đang chờ kết nối backend. Link chưa được gửi đi.");
  };

  return (
    <section className={styles.hero} id="top">
      <div className={`container ${styles.heroGrid}`}>
        <div className={styles.heroCopy}>
          <span className="sectionEyebrow">Dịch vụ VietTrung Order</span>
          <h1>
            Giải pháp nhập hàng Trung Quốc <em>toàn diện, an toàn và hiệu quả</em>
          </h1>
          <p>
            Hỗ trợ từ tìm nguồn hàng, đặt mua, thanh toán, quản lý kho đến vận
            chuyển và theo dõi đơn hàng trên cùng một hệ thống.
          </p>
          <ul>
            {heroHighlights.map((item) => <li key={item}><CheckCircle2 /> {item}</li>)}
          </ul>
          <form onSubmit={handleSubmit} noValidate>
            <label className="srOnly" htmlFor="service-source-url">Link sản phẩm hoặc nguồn hàng</label>
            <div className={styles.urlInput}><Link2 /><input id="service-source-url" type="url" value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); setFeedback(""); }} placeholder="Dán link sản phẩm hoặc website nguồn hàng..." /></div>
            <Button type="submit"><Send size={17} /> Gửi yêu cầu</Button>
          </form>
          <p className={styles.formFeedback} role="status">{feedback || "Form chỉ kiểm tra định dạng; chưa gửi dữ liệu khi chưa có API."}</p>
        </div>

        <div className={styles.heroVisual}>
          <ImageSlot label="Ảnh logistics trang Dịch vụ" alt="Minh họa dịch vụ logistics VietTrung Order" eager />
          <div className={styles.floatingServices} aria-label="Nhóm dịch vụ nổi bật">
            <span><ShoppingBag /> Đặt hàng đa nguồn</span>
            <span><Boxes /> Kho Trung Quốc</span>
            <span><MapPinned /> Theo dõi vận chuyển</span>
          </div>
        </div>
      </div>
    </section>
  );
}
