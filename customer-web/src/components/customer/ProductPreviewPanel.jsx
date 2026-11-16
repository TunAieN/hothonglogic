import { Image as ImageIcon, LoaderCircle, PackageSearch, RefreshCw } from "lucide-react";
import ProductThumbnail from "./ProductThumbnail.jsx";
import feature from "./CustomerPortalFeatures.module.css";

export default function ProductPreviewPanel({ product, status, message, selectedImage, onSelectImage, onRetry }) {
  if (status === "loading") return <div className={feature.previewSkeleton} role="status" aria-live="polite">
    <span className={feature.skeletonImage} /><div><span /><span /><span /></div><p><LoaderCircle aria-hidden="true" /> Đang lấy thông tin sản phẩm...</p>
  </div>;

  if (["error", "unavailable"].includes(status)) return <div className={`${feature.previewState} ${status === "error" ? feature.previewError : ""}`} role="status">
    <ImageIcon aria-hidden="true" /><div><strong>{status === "error" ? "Không thể lấy thông tin" : "Chưa tích hợp lấy thông tin tự động"}</strong><p>{message}</p></div>{onRetry && <button className={feature.secondary} type="button" onClick={onRetry}><RefreshCw aria-hidden="true" />Thử lại</button>}
  </div>;

  if (!["success", "partial"].includes(status)) return <div className={feature.previewState}>
    <PackageSearch aria-hidden="true" /><div><strong>Chưa có thông tin xem trước</strong><p>Nhập link hợp lệ rồi chọn “Lấy thông tin”, hoặc dùng sản phẩm mẫu trong Demo Mode. Bạn vẫn có thể nhập thủ công bên dưới.</p></div>
  </div>;

  const images = product.images?.length ? product.images : product.imageUrl ? [product.imageUrl] : [];
  return <div className={feature.productPreview}>
    <div className={feature.previewGallery}>
      <ProductThumbnail src={selectedImage || product.imageUrl} alt={product.name || "Ảnh sản phẩm minh họa"} size="large" eager />
      {images.length > 1 && <div className={feature.previewThumbs} aria-label="Ảnh sản phẩm phụ">{images.map((image, index) => <button type="button" className={(selectedImage || product.imageUrl) === image ? feature.activeThumb : ""} onClick={() => onSelectImage(image)} key={`${image}-${index}`} aria-label={`Xem ảnh ${index + 1}`}><ProductThumbnail src={image} alt="" size="small" /></button>)}</div>}
    </div>
    <div className={feature.previewInfo}>
      <div className={feature.previewBadges}><span className={feature.badge}>{product.metadataSource === "demo" ? "Dữ liệu minh họa" : "Dữ liệu tham khảo"}</span>{status === "partial" && <span className={feature.partialBadge}>Thiếu thông tin</span>}</div>
      <h3>{product.name || "Chưa có tên sản phẩm"}</h3>
      {status === "partial" && message && <p>{message}</p>}
      <p className={feature.sourceUrl} title={product.sourceUrl}>{product.sourceUrl || "Sản phẩm mẫu không có link nguồn thực tế"}</p>
      <dl><div><dt>Nguồn hàng</dt><dd>{product.source || product.platform || "Chưa xác định"}</dd></div><div><dt>Giá tham khảo</dt><dd>{product.priceCny !== "" && product.priceCny != null ? `${Number(product.priceCny).toLocaleString("vi-VN")} CNY` : "Chưa có"}</dd></div><div><dt>Phân loại</dt><dd>{product.variant || "Chưa có"}</dd></div><div><dt>Thuộc tính</dt><dd>{[product.color, product.size].filter(Boolean).join(" · ") || "Chưa có"}</dd></div></dl>
      <small>Thông tin tự lấy hoặc minh họa chỉ là dữ liệu ban đầu, không phải báo giá chính thức.</small>
    </div>
  </div>;
}

