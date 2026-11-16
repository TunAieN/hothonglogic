import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import styles from "./ProductThumbnail.module.css";

export default function ProductThumbnail({ src, alt = "Ảnh sản phẩm", size = "medium", eager = false, className = "" }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const failed = Boolean(src && failedSrc === src);

  return <span className={`${styles.thumbnail} ${styles[size] || styles.medium} ${className}`}>
    {src && !failed
      ? <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} onError={() => setFailedSrc(src)} />
      : <span className={styles.fallback} role="img" aria-label="Chưa có ảnh sản phẩm"><ImageIcon aria-hidden="true" /></span>}
  </span>;
}

