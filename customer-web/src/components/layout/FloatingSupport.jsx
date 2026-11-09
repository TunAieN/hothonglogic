import { useEffect, useRef, useState } from "react";
import { ChevronRight, CircleHelp, Headset, MessageCircle, MessagesSquare, Send, X } from "lucide-react";
import { supportChannels } from "../../config/supportChannels.js";
import styles from "./FloatingSupport.module.css";

const channelIcons = {
  message: MessageCircle,
  send: Send,
  messages: MessagesSquare,
  headset: Headset,
  help: CircleHelp,
};

export default function FloatingSupport() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const closeRef = useRef(null);

  const closePanel = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();

    const onPointerDown = (event) => {
      if (panelRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      closePanel();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") closePanel();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return <div className={styles.widget}>
    <section
      ref={panelRef}
      id="floating-support-panel"
      className={`${styles.panel} ${open ? styles.panelOpen : ""}`}
      role="dialog"
      aria-label="Các kênh hỗ trợ VietTrung Order"
      aria-hidden={!open}
    >
      <header className={styles.panelHeader}>
        <span className={styles.headerIcon}><Headset aria-hidden="true" /></span>
        <div><h2>VietTrung Support</h2><p>Chúng tôi có thể giúp gì cho bạn?</p></div>
        <button ref={closeRef} type="button" aria-label="Đóng bảng hỗ trợ" onClick={() => closePanel()}><X /></button>
      </header>
      <div className={styles.channelList}>
        {supportChannels.map((channel) => {
          const Icon = channelIcons[channel.icon] || MessageCircle;
          const validUrl = typeof channel.url === "string" && (channel.external ? /^https:\/\//i.test(channel.url) : channel.url.startsWith("/"));
          const available = channel.enabled && validUrl;
          const content = <><span className={`${styles.channelIcon} ${styles[channel.id] || ""}`}><Icon aria-hidden="true" /></span><span className={styles.channelCopy}><strong>{channel.label}</strong><small>{available ? channel.description : channel.unavailableLabel}</small></span>{available && <ChevronRight className={styles.chevron} aria-hidden="true" />}</>;

          if (!available) return <div className={`${styles.channel} ${styles.disabled}`} aria-disabled="true" key={channel.id}>{content}</div>;
          return <a className={styles.channel} href={channel.url} target={channel.external ? "_blank" : undefined} rel={channel.external ? "noopener noreferrer" : undefined} key={channel.id} onClick={() => setOpen(false)}>{content}</a>;
        })}
      </div>
      <p className={styles.panelNote}>Các kênh liên hệ chỉ hoạt động khi được cấu hình đường dẫn chính thức.</p>
    </section>
    <button
      ref={triggerRef}
      type="button"
      className={styles.trigger}
      aria-label={open ? "Đóng bảng hỗ trợ" : "Mở bảng hỗ trợ"}
      aria-expanded={open}
      aria-controls="floating-support-panel"
      onClick={() => setOpen((value) => !value)}
    >
      {open ? <X aria-hidden="true" /> : <Headset aria-hidden="true" />}
    </button>
  </div>;
}
