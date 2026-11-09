import { ImageIcon } from "lucide-react";
import styles from "./ImageSlot.module.css";

export default function ImageSlot({ src, alt, label = "Ảnh sẽ được bổ sung", className = "", eager = false }) {
  if (src) return <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} className={`${styles.image} ${className}`} />;
  return <div className={`${styles.placeholder} ${className}`} role="img" aria-label={label}><ImageIcon size={30} /><span>{label}</span></div>;
}
