import { BookOpen } from "lucide-react";
import { serviceArticles } from "../../data/serviceArticles.js";
import ImageSlot from "../ui/ImageSlot.jsx";
import styles from "./ServicesPageSections.module.css";

export default function ServiceArticles() {
  return <section className={`section ${styles.articles}`}><div className="container"><div className={styles.articlesHeading}><div><span className="sectionEyebrow">Kiến thức &amp; cập nhật</span><h2 className="sectionTitle">Kiến thức hữu ích cho người nhập hàng</h2><p className="sectionDescription">Các chủ đề dưới đây là vị trí nội dung dự kiến, chưa phải bài viết đã xuất bản.</p></div><span><BookOpen /> CMS chưa kết nối</span></div><div className={styles.articleGrid}>{serviceArticles.map((article) => <article key={article.id}><div className={styles.articleMedia}><ImageSlot src={article.image} alt={`Ảnh bài viết ${article.title}`} label="Ảnh bài viết 16:9" /></div><div className={styles.articleBody}><span>{article.category}</span><h3>{article.title}</h3><p>{article.summary}</p><small>Nội dung đang cập nhật</small></div></article>)}</div></div></section>;
}
