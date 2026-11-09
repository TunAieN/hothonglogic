import {
  ArrowRight, Boxes, ClipboardCheck, Flag, Headphones, HeartHandshake,
  Layers3, PackageSearch, ReceiptText, Route, ScanLine, ShieldCheck,
  ShoppingCart, Target, Truck, Warehouse, Zap,
} from "lucide-react";
import Button from "../ui/Button.jsx";
import ImageSlot from "../ui/ImageSlot.jsx";
import {
  aboutHero, capabilities, commitments, coreValues, missionVision,
  teamDepartments, warehouses,
} from "../../data/aboutContent.js";
import styles from "./AboutSections.module.css";

const icons = {
  boxes: Boxes, clipboard: ClipboardCheck, flag: Flag, handshake: HeartHandshake,
  headphones: Headphones, heart: HeartHandshake, layers: Layers3, package: PackageSearch,
  receipt: ReceiptText, route: Route, scan: ScanLine, search: PackageSearch,
  shield: ShieldCheck, target: Target, truck: Truck, warehouse: Warehouse, zap: Zap,
};

function Icon({ name, size = 24 }) {
  const Component = icons[name] || Boxes;
  return <Component size={size} aria-hidden="true" />;
}

export function AboutHero() {
  const emphasized = "nguồn hàng Trung Quốc";
  const start = aboutHero.title.replace(emphasized, "");
  return <section className={styles.hero} id="top"><div className={`container ${styles.heroGrid}`}><div className={styles.heroCopy}><span className={styles.eyebrow}><Target size={16} />{aboutHero.eyebrow}</span><h1>{start}<span>{emphasized}</span></h1><p>{aboutHero.description}</p><strong className={styles.slogan}>{aboutHero.slogan}</strong><div className={styles.heroActions}><Button href="/dich-vu">Khám phá dịch vụ <ArrowRight size={17} /></Button><Button href="/#ho-tro" variant="secondary"><ShoppingCart size={17} /> Bắt đầu đặt hàng</Button></div></div><div className={styles.heroVisual}><ImageSlot src={aboutHero.image} alt="Không gian kho vận VietTrung Order" label="Ảnh kho hàng hoặc logistics" eager /><div className={styles.visualNote}><Boxes size={20}/><span><strong>Hệ thống tập trung</strong>Đặt hàng · Kho vận · Theo dõi</span></div></div></div></section>;
}

export function BrandStory() {
  return <><section className={`section ${styles.story}`}><div className={`container ${styles.storyGrid}`}><div className={styles.storyCopy}><span className="sectionEyebrow">Câu chuyện thương hiệu</span><h2 className="sectionTitle">Từ nhu cầu thực tế đến giải pháp toàn diện</h2><p>VietTrung Order được định hướng như một hệ thống giúp giảm bớt khó khăn khi nhập hàng: tập trung thông tin đặt hàng, kho và vận chuyển, đồng thời giúp khách hàng quản lý đơn thuận tiện và minh bạch hơn.</p></div><div className={styles.missionGrid}>{missionVision.map((item) => <article key={item.title} className={styles.infoCard}><span className={styles.iconBox}><Icon name={item.icon}/></span><div><h3>{item.title}</h3><p>{item.description}</p></div></article>)}</div></div></section><section className={styles.values} aria-labelledby="core-values-title"><div className="container"><h2 id="core-values-title" className="srOnly">Giá trị cốt lõi</h2><div className={styles.valueStrip}>{coreValues.map((item) => <div key={item.title} className={styles.valueItem}><span><Icon name={item.icon}/></span><div><strong>{item.title}</strong><small>{item.description}</small></div></div>)}</div></div></section></>;
}

export function CapabilitiesSection() {
  return <section className={`section ${styles.capabilities}`}><div className="container"><div className={styles.centerHeader}><span className="sectionEyebrow">Năng lực nền tảng</span><h2 className="sectionTitle">Một hệ thống kết nối xuyên suốt quy trình</h2><p>Thay cho số liệu chưa được xác minh, các năng lực dưới đây mô tả phạm vi hệ thống đang hướng tới.</p></div><div className={styles.capabilityGrid}>{capabilities.map((item) => <article key={item.title} className={styles.capabilityCard}><span className={styles.iconBox}><Icon name={item.icon}/></span><h3>{item.title}</h3><p>{item.description}</p></article>)}</div></div></section>;
}

export function WarehouseSection() {
  return <section className={`section ${styles.warehouseSection}`}><div className="container"><div className={styles.splitHeader}><div><span className="sectionEyebrow">Hệ thống kho bãi</span><h2 className="sectionTitle">Hạ tầng kho vận và quy trình quản lý hàng hóa</h2></div><p>Nội dung được thiết kế để cập nhật hình ảnh và thông tin vận hành đã xác minh trong giai đoạn tiếp theo.</p></div><div className={styles.warehouseGrid}>{warehouses.map((item) => <article key={item.title} className={styles.imageCard}><div className={styles.cardImage}><ImageSlot src={item.image} alt={item.title} label={`Ảnh ${item.title.toLowerCase()}`} /></div><div className={styles.imageCardBody}><span className={styles.iconBox}><Icon name={item.icon}/></span><div><h3>{item.title}</h3><p>{item.description}</p></div></div></article>)}</div></div></section>;
}

export function TeamSection() {
  return <section className={`section ${styles.teamSection}`}><div className={`container ${styles.teamGrid}`}><div className={styles.teamIntro}><span className="sectionEyebrow">Đội ngũ của chúng tôi</span><h2 className="sectionTitle">Con người tận tâm là nền tảng dịch vụ</h2><p>Các nhóm nghiệp vụ phối hợp để tiếp nhận yêu cầu, theo dõi quá trình xử lý và hỗ trợ khách hàng trong từng giai đoạn.</p><div className={styles.teamImage}><ImageSlot label="Ảnh đội ngũ VietTrung Order" /></div></div><div className={styles.departmentList}>{teamDepartments.map((item) => <article key={item.title} className={styles.departmentCard}><span className={styles.iconBox}><Icon name={item.icon}/></span><div><h3>{item.title}</h3><p>{item.description}</p></div></article>)}</div></div></section>;
}

export function CommitmentsSection() {
  return <section className={`section ${styles.commitments}`}><div className="container"><div className="sectionHeader"><span className="sectionEyebrow">Cam kết dịch vụ</span><h2 className="sectionTitle">Đồng hành an toàn và minh bạch</h2></div><div className={styles.commitmentGrid}>{commitments.map((item) => <article key={item.title} className={styles.commitmentCard}><span className={styles.iconBox}><Icon name={item.icon}/></span><div><h3>{item.title}</h3><p>{item.description}</p></div></article>)}</div></div></section>;
}

export function AboutCTA() {
  return <section className={styles.ctaSection}><div className={`container ${styles.cta}`}><div><span>VietTrung Order</span><h2>Sẵn sàng nhập hàng cùng VietTrung Order?</h2><p>Khám phá giải pháp nhập hàng và quản lý logistics phù hợp với nhu cầu của bạn.</p></div><div className={styles.ctaActions}><Button href="/#ho-tro" variant="secondary">Tạo tài khoản <ArrowRight size={17}/></Button><Button href="/dich-vu" className={styles.outlineButton}>Khám phá dịch vụ</Button></div></div></section>;
}
