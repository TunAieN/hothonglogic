import { useCallback, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { platforms } from "../../data/platforms.js";
import styles from "./PlatformsSection.module.css";

const statusContent = {
  configured: "Có cấu hình",
  unverified: "Chưa xác minh",
  "contact-required": "Tiếp nhận yêu cầu",
  future: "Đang mở rộng",
};

function PlatformVisual({ platform }) {
  if (platform.logo) {
    return <img src={platform.logo} alt={`Logo ${platform.name}`} loading="lazy" />;
  }

  const Icon = platform.icon;
  return <Icon aria-hidden="true" />;
}

export default function PlatformsSection() {
  const trackRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const scrollToCard = useCallback((index) => {
    const nextIndex = Math.max(0, Math.min(index, platforms.length - 1));
    const cards = trackRef.current?.querySelectorAll("article");

    cards?.[nextIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "start",
    });
    setActiveIndex(nextIndex);
  }, []);

  const syncActiveCard = () => {
    const track = trackRef.current;
    if (!track) return;

    const cards = [...track.querySelectorAll("article")];
    const nextIndex = cards.reduce((closestIndex, card, index) => {
      const currentDistance = Math.abs(card.offsetLeft - track.scrollLeft);
      const closestDistance = Math.abs(
        cards[closestIndex].offsetLeft - track.scrollLeft,
      );
      return currentDistance < closestDistance ? index : closestIndex;
    }, 0);

    setActiveIndex(nextIndex);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollToCard(activeIndex + 1);
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollToCard(activeIndex - 1);
    }
  };

  return (
    <section className={`section ${styles.section}`} id="nguon-hang">
      <div className="container">
        <div className={styles.heading}>
          <div className={styles.headingCopy}>
            <span className="sectionEyebrow">Nguồn hàng &amp; nền tảng hỗ trợ</span>
            <h2 className="sectionTitle">Một hệ thống, nhiều nguồn hàng</h2>
            <p className="sectionDescription">
              Tiếp nhận nhu cầu từ nhiều nền tảng, website và nhà cung cấp để quản
              lý đơn hàng tập trung hơn.
            </p>
          </div>

          <div className={styles.headingTools}>
            <a href="#ho-tro">
              Yêu cầu nguồn hàng khác <ArrowRight size={14} />
            </a>
            <div className={styles.controls}>
              <button
                type="button"
                onClick={() => scrollToCard(activeIndex - 1)}
                disabled={activeIndex === 0}
                aria-label="Xem nền tảng trước"
              >
                <ArrowLeft />
              </button>
              <button
                type="button"
                onClick={() => scrollToCard(activeIndex + 1)}
                disabled={activeIndex === platforms.length - 1}
                aria-label="Xem nền tảng tiếp theo"
              >
                <ArrowRight />
              </button>
            </div>
          </div>
        </div>

        <div
          ref={trackRef}
          className={styles.track}
          role="region"
          tabIndex="0"
          aria-label="Danh sách nguồn hàng mục tiêu"
          onScroll={syncActiveCard}
          onKeyDown={handleKeyDown}
        >
          {platforms.map((platform) => (
            <article className={styles.card} key={platform.id}>
              <div className={styles.cardTop}>
                <span className={styles.visual}>
                  <PlatformVisual platform={platform} />
                </span>
                <span className={`${styles.status} ${styles[platform.status]}`}>
                  {statusContent[platform.status]}
                </span>
              </div>
              <h3>{platform.name}</h3>
              <p>{platform.description}</p>
              {platform.actionHref && (
                <a className={styles.cardAction} href={platform.actionHref}>
                  {platform.actionLabel} <ArrowRight size={13} />
                </a>
              )}
            </article>
          ))}
        </div>

        <p className={styles.disclaimer}>
          Trạng thái phản ánh cấu hình đã kiểm tra, không đồng nghĩa mọi nguồn đều
          được tích hợp hoặc tự động đặt hàng.
        </p>
      </div>
    </section>
  );
}
