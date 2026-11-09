import { AlertCircle, ArrowLeft, BookOpen } from "lucide-react";
import Header from "../components/layout/Header.jsx";
import Footer from "../components/layout/Footer.jsx";
import Button from "../components/ui/Button.jsx";
import ImageSlot from "../components/ui/ImageSlot.jsx";
import { guides } from "../data/helpContent.js";
import styles from "../components/help/GuideDetail.module.css";

export default function GuideDetailPage({ slug }) {
  const guide = guides.find((item) => item.slug === slug && item.status === "published");
  if (!guide) return <><Header/><main className={styles.notFound}><div><BookOpen size={42}/><h1>Hướng dẫn chưa sẵn sàng</h1><p>Nội dung này chưa được xuất bản hoặc đường dẫn không tồn tại.</p><Button href="/huong-dan">Quay lại trung tâm hướng dẫn</Button></div></main><Footer/></>;
  return <><Header/><main className={styles.page}><section className={styles.hero}><div className="container"><nav className={styles.breadcrumb} aria-label="Breadcrumb"><a href="/">Trang chủ</a><b>/</b><a href="/huong-dan">Hướng dẫn</a><b>/</b><span>{guide.title}</span></nav><h1>{guide.title}</h1><p>{guide.description}</p><div className={styles.notice}><AlertCircle size={20}/><span>Nội dung chỉ mô tả những phần đã kiểm tra trong repository. Các bước chưa có tài liệu nghiệp vụ được đánh dấu “Đang cập nhật”.</span></div></div></section><section className={styles.content}><div className="container"><div className={styles.stepList}>{guide.steps.map((step,index) => <article className={styles.step} key={step.title}><span className={styles.stepNumber}>{String(index+1).padStart(2,"0")}</span><div><div className={styles.stepHeader}><h2>{step.title}</h2>{step.status === "pending" && <span>Đang cập nhật</span>}</div><p>{step.description}</p><div className={styles.stepImage}><ImageSlot src={step.image} alt={step.imageAlt} label={`Screenshot bước ${index+1} sẽ được bổ sung`}/></div></div></article>)}</div><div className={styles.back}><Button href="/huong-dan" variant="secondary"><ArrowLeft size={17}/> Quay lại trung tâm hướng dẫn</Button></div></div></section></main><Footer/></>;
}
