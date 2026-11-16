import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { HERO_AUTOPLAY_DELAY, heroSlides } from "../../data/heroSlides.js";
import styles from "./HeroSlider.module.css";

const SWIPE_THRESHOLD = 52;
const getReducedMotionPreference = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function HeroSlider({ children }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [cycleKey, setCycleKey] = useState(0);
  const [userPaused, setUserPaused] = useState(getReducedMotionPreference);
  const [reducedMotion, setReducedMotion] = useState(getReducedMotionPreference);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === "visible");
  const [failedImages, setFailedImages] = useState(() => new Set());
  const pointerStart = useRef(null);

  const goTo = useCallback((index) => {
    setActiveIndex((index + heroSlides.length) % heroSlides.length);
    setCycleKey((value) => value + 1);
  }, []);
  const showPrevious = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);
  const showNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event) => {
      setReducedMotion(event.matches);
      if (event.matches) setUserPaused(true);
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const handleVisibility = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const autoplayActive = !userPaused && !reducedMotion;
  const temporarilyPaused = hovered || focusWithin || !pageVisible;

  useEffect(() => {
    if (!autoplayActive || temporarilyPaused) return undefined;
    const timer = window.setTimeout(() => setActiveIndex((current) => (current + 1) % heroSlides.length), HERO_AUTOPLAY_DELAY);
    return () => window.clearTimeout(timer);
  }, [activeIndex, autoplayActive, cycleKey, temporarilyPaused]);

  useEffect(() => {
    const preloadImage = new Image();
    preloadImage.src = heroSlides[(activeIndex + 1) % heroSlides.length].image;
  }, [activeIndex]);

  const handleKeyDown = (event) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); showPrevious(); }
    if (event.key === "ArrowRight") { event.preventDefault(); showNext(); }
  };

  const handlePointerDown = (event) => {
    if (event.pointerType !== "mouse") pointerStart.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event) => {
    if (!pointerStart.current || event.pointerType === "mouse") return;
    const deltaX = event.clientX - pointerStart.current.x;
    const deltaY = event.clientY - pointerStart.current.y;
    pointerStart.current = null;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
    if (deltaX < 0) showNext(); else showPrevious();
  };

  const handleImageError = (index) => {
    setFailedImages((current) => {
      const next = new Set(current);
      next.add(index);
      return next;
    });
  };

  return (
    <div className={styles.slider} role="region" aria-roledescription="carousel" aria-label="Hình ảnh hoạt động logistics VietTrung Order" tabIndex="0" onKeyDown={handleKeyDown} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocusWithin(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusWithin(false); }} onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={() => { pointerStart.current = null; }}>
      <div className={styles.slides} aria-live="off">
        {heroSlides.map((slide, index) => {
          const failed = failedImages.has(index);
          return <div className={`${styles.slide} ${index === activeIndex ? styles.active : ""} ${failed ? styles.failed : ""}`} key={slide.id} aria-hidden={index !== activeIndex}>{!failed && <img src={slide.image} alt={slide.alt} className={styles.image} style={{ "--image-position": slide.position, "--mobile-image-position": slide.mobilePosition }} loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} decoding="async" onError={() => handleImageError(index)} />}{failed && <span className={styles.fallbackText}>Ảnh minh họa chưa sẵn sàng</span>}</div>;
        })}
      </div>
      <div className={styles.overlay} aria-hidden="true" />
      <div className={styles.content}>{children}</div>
      <button className={`${styles.arrow} ${styles.previous}`} type="button" onClick={showPrevious} aria-label="Xem ảnh logistics trước"><ChevronLeft aria-hidden="true" /></button>
      <button className={`${styles.arrow} ${styles.next}`} type="button" onClick={showNext} aria-label="Xem ảnh logistics tiếp theo"><ChevronRight aria-hidden="true" /></button>
      <div className={styles.pagination} aria-label="Chọn ảnh logistics">{heroSlides.map((slide, index) => <button key={slide.id} type="button" className={`${styles.dot} ${index === activeIndex ? styles.activeDot : ""}`} onClick={() => goTo(index)} aria-label={`Hiển thị ảnh ${index + 1} trong ${heroSlides.length}`} aria-current={index === activeIndex ? "true" : undefined} />)}</div>
      <button className={styles.autoplay} type="button" onClick={() => setUserPaused((value) => !value)} disabled={reducedMotion} aria-label={reducedMotion ? "Tự động chuyển ảnh đã tắt theo cài đặt giảm chuyển động" : userPaused ? "Phát tự động" : "Tạm dừng tự động"} title={reducedMotion ? "Đã tắt theo tùy chọn giảm chuyển động của thiết bị" : undefined}>{userPaused || reducedMotion ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}<span>{userPaused || reducedMotion ? "Phát tự động" : "Tạm dừng"}</span></button>
    </div>
  );
}
