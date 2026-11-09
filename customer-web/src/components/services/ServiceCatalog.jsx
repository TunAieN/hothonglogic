import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { services } from "../../data/services.js";
import styles from "./ServicesPageSections.module.css";

export default function ServiceCatalog() {
  const trackRef = useRef(null);

  const handleKeyDown = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const firstCard = trackRef.current?.querySelector("article");
    const gap = 18;

    trackRef.current?.scrollBy({
      left: direction * ((firstCard?.offsetWidth || 260) + gap),
      behavior: "smooth",
    });
  };

  return (
    <section className={`section ${styles.catalog}`} id="danh-muc-dich-vu">
      <div className="container">
        <div className={styles.catalogHeading}>
          <span className="sectionEyebrow">Danh mục dịch vụ</span>
          <h2 className="sectionTitle">Các dịch vụ của VietTrung Order</h2>
          <p className="sectionDescription">
            Giải pháp hỗ trợ nhập hàng, thanh toán, quản lý kho và vận chuyển trên
            cùng một hệ thống.
          </p>
        </div>

        <div
          ref={trackRef}
          className={styles.catalogGrid}
          role="region"
          tabIndex="0"
          aria-label="Danh mục dịch vụ VietTrung Order"
          onKeyDown={handleKeyDown}
        >
          {services.map((service) => {
            const Icon = service.catalogIcon || service.icon;

            return (
              <article id={`service-${service.id}`} key={service.id}>
                <span className={styles.catalogIcon}><Icon /></span>
                <h3>{service.catalogTitle || service.title}</h3>
                <p>{service.catalogDescription || service.description}</p>
                <a href="#service-contact">
                  Xem chi tiết <ArrowRight />
                </a>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
