import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { platforms } from "../../data/platforms.js";
import styles from "./PlatformsSection.module.css";

function PlatformVisual({ platform }) {
  if (platform.logo) {
    return <img src={platform.logo} alt="" loading="lazy" />;
  }

  const Icon = platform.icon;
  return <Icon aria-hidden="true" />;
}

export default function PlatformsSection() {
  const trackRef = useRef(null);
  const [scrollState, setScrollState] = useState({ atStart: true, atEnd: false });

  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const atStart = track.scrollLeft <= 2;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    setScrollState((current) => current.atStart === atStart && current.atEnd === atEnd
      ? current
      : { atStart, atEnd });
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    const frame = window.requestAnimationFrame(updateScrollState);
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(track);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [updateScrollState]);

  const scrollByItem = useCallback((direction) => {
    const track = trackRef.current;
    if (!track) return;

    const firstItem = track.querySelector("article");
    const gap = Number.parseFloat(window.getComputedStyle(track).columnGap) || 12;
    const distance = (firstItem?.offsetWidth || 148) + gap;
    track.scrollBy({ left: direction * distance, behavior: "smooth" });
  }, []);

  const handleKeyDown = (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollByItem(1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollByItem(-1);
    }
  };

  return (
    <section className={`section ${styles.section}`} id="nguon-hang" aria-labelledby="platforms-title">
      <div className="container">
        <div className={styles.heading}>
          <div className={styles.headingCopy}>
            <span className="sectionEyebrow">Nguồn hàng &amp; nền tảng hỗ trợ</span>
            <h2 className="sectionTitle" id="platforms-title">Một hệ thống, nhiều nguồn hàng</h2>
            <p className="sectionDescription">Tiếp nhận nhu cầu từ nhiều nền tảng, website và nhà cung cấp để quản lý đơn hàng tập trung hơn.</p>
          </div>

          <div className={styles.headingTools}>
            <a href="#ho-tro">Yêu cầu nguồn hàng khác <ArrowRight size={14} aria-hidden="true" /></a>
            <div className={styles.controls} aria-label="Điều khiển danh sách nền tảng">
              <button type="button" onClick={() => scrollByItem(-1)} disabled={scrollState.atStart} aria-label="Xem nền tảng trước"><ArrowLeft aria-hidden="true" /></button>
              <button type="button" onClick={() => scrollByItem(1)} disabled={scrollState.atEnd} aria-label="Xem nền tảng tiếp theo"><ArrowRight aria-hidden="true" /></button>
            </div>
          </div>
        </div>

        <div className={`${styles.rail} ${scrollState.atEnd ? styles.atEnd : ""}`}>
          <div ref={trackRef} className={styles.track} role="list" tabIndex="0" aria-label="Danh sách nguồn hàng mục tiêu" onScroll={updateScrollState} onKeyDown={handleKeyDown}>
            {platforms.map((platform) => (
              <article className={styles.item} key={platform.id} role="listitem">
                <span className={styles.visual}><PlatformVisual platform={platform} /></span>
                <h3>{platform.name}</h3>
              </article>
            ))}
          </div>
        </div>

        <p className={styles.disclaimer}>Khả năng tiếp nhận và xử lý tùy thuộc từng nguồn hàng. Vui lòng liên hệ để được tư vấn.</p>
      </div>
    </section>
  );
}
