import { useState } from "react";
import { ArrowRight, ChevronDown, CircleHelp, Headphones, Laptop, Package, PackageSearch, Search, ShoppingCart, Wallet, X } from "lucide-react";
import Button from "../ui/Button.jsx";
import ImageSlot from "../ui/ImageSlot.jsx";
import { helpCategories, helpFaqs, helpVideos } from "../../data/helpContent.js";
import styles from "./HelpCenterSections.module.css";

const icons = { laptop: Laptop, cart: ShoppingCart, package: Package, wallet: Wallet };

export function HelpHero({ query, onQueryChange, onSubmit, onTag }) {
  const tags = [["Cài Extension", "extension"], ["Tạo đơn hàng", "tạo đơn hàng"], ["Thanh toán", "thanh toán"], ["Ký gửi hàng", "ký gửi"]];
  return <section className={styles.hero} id="top"><div className={`container ${styles.heroGrid}`}><div><span className={styles.eyebrow}><CircleHelp size={16}/> Trung tâm hướng dẫn</span><h1>Bạn cần <span>giúp gì</span> hôm nay?</h1><p>Tìm kiếm hướng dẫn, xem các bước thao tác và giải đáp những câu hỏi thường gặp khi sử dụng VietTrung Order.</p><form className={styles.searchForm} role="search" onSubmit={onSubmit}><Search aria-hidden="true"/><label className="srOnly" htmlFor="help-search">Tìm trong trung tâm hướng dẫn</label><input id="help-search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Nhập từ khóa cần tìm..." autoComplete="off"/>{query && <button type="button" className={styles.clearSearch} aria-label="Xóa từ khóa tìm kiếm" onClick={() => onQueryChange("")}><X size={18}/></button>}<Button type="submit">Tìm kiếm</Button></form><div className={styles.tags}><strong>Tìm kiếm phổ biến:</strong>{tags.map(([label, value]) => <button type="button" key={label} onClick={() => onTag(value)}>{label}</button>)}</div></div><div className={styles.heroVisual}><ImageSlot label="Minh họa trung tâm hướng dẫn" eager/><div className={styles.heroIcons}><CircleHelp/><Laptop/><PackageSearch/></div></div></div></section>;
}

export function QuickCategories({ activeCategory, onSelect }) {
  return <section className={`section ${styles.categories}`} aria-labelledby="categories-title"><div className="container"><h2 id="categories-title" className={styles.sectionTitle}>Hướng dẫn nhanh theo nhu cầu</h2><div className={styles.categoryGrid}>{helpCategories.map((item) => { const Icon = icons[item.icon]; return <button type="button" key={item.id} className={`${styles.categoryCard} ${activeCategory === item.id ? styles.categoryActive : ""}`} onClick={() => onSelect(item.id)} aria-pressed={activeCategory === item.id}><span><Icon/></span><h3>{item.title}</h3><p>{item.description}</p><i><ArrowRight size={17}/></i></button>; })}</div></div></section>;
}

export function GuideResults({ guides, query, category, onReset }) {
  const filtered = Boolean(query.trim()) || category !== "all";
  return <section className={styles.guides} id="guide-results" aria-labelledby="guides-title"><div className="container"><div className={styles.guideHeading}><div><h2 id="guides-title" className={styles.sectionTitle}>{filtered ? "Kết quả hướng dẫn" : "Hướng dẫn chi tiết từng bước"}</h2><p role="status" aria-live="polite">{guides.length ? `Tìm thấy ${guides.length} hướng dẫn phù hợp.` : "Không tìm thấy hướng dẫn đã xuất bản phù hợp."}</p></div>{filtered && <button type="button" onClick={onReset}>Xem tất cả</button>}</div>{guides.length ? <div className={styles.guideGrid}>{guides.map((guide, index) => <article className={styles.guideCard} key={guide.id}><div className={styles.guideTop}><b>{String(index + 1).padStart(2,"0")}</b><h3>{guide.title}</h3></div><div className={styles.guideImage}><ImageSlot src={guide.thumbnail} alt={guide.title} label={`Ảnh hướng dẫn ${guide.title.toLowerCase()}`}/></div><p>{guide.description}</p><ul>{guide.highlights.slice(0,3).map((item) => <li key={item}>{item}</li>)}</ul><Button href={`/huong-dan/${guide.slug}`} variant="secondary">Xem hướng dẫn chi tiết <ArrowRight size={16}/></Button></article>)}</div> : <div className={styles.emptyState}><Search/><h3>Nội dung đang được cập nhật</h3><p>Danh mục hoặc từ khóa này chưa có hướng dẫn đã xác minh. Vui lòng thử từ khóa khác.</p><button type="button" onClick={onReset}>Xóa bộ lọc</button></div>}</div></section>;
}

export function ResourcesSection() {
  const [openFaq, setOpenFaq] = useState(0);
  return <section className={`section ${styles.resources}`} id="faq"><div className={`container ${styles.resourceGrid}`}><div><h2 className={styles.sectionTitle}>Video hướng dẫn nổi bật</h2><div className={styles.videoGrid}>{helpVideos.map((video) => <article className={styles.videoCard} key={video.id}><div className={styles.videoPlaceholder}><ImageSlot src={video.thumbnail} alt={video.title} label="Video đang được cập nhật"/></div><h3>{video.title}</h3><p>{video.description}</p><span>Đang cập nhật</span></article>)}</div></div><div><h2 className={styles.sectionTitle}>Câu hỏi thường gặp</h2><div className={styles.faqList}>{helpFaqs.map((item,index) => { const open = openFaq === index; const answerId = `help-faq-${index}`; return <article key={item.question}><button type="button" aria-expanded={open} aria-controls={answerId} onClick={() => setOpenFaq(open ? -1 : index)}><CircleHelp size={19}/><span>{item.question}</span><ChevronDown className={open ? styles.rotated : ""}/></button><div id={answerId} hidden={!open}><p>{item.answer}</p></div></article>; })}</div></div></div></section>;
}

export function HelpSupportCTA() {
  return <section className={styles.supportSection}><div className={`container ${styles.supportCta}`}><span className={styles.supportIcon}><Headphones/></span><div><h2>Bạn vẫn gặp khó khăn?</h2><p>VietTrung Order sẵn sàng tiếp nhận và hỗ trợ giải đáp những thắc mắc trong quá trình sử dụng dịch vụ.</p></div><Button href="/#ho-tro" variant="secondary">Đến khu hỗ trợ <ArrowRight size={17}/></Button></div></section>;
}
