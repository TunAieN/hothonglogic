import { Package, ShoppingCart } from "lucide-react";
import { pricingConfig } from "../../data/pricingConfig.js";
import styles from "./PricingPage.module.css";

const icons = { retail: ShoppingCart, wholesale: Package };

export default function CustomerTypeTabs({ value, onChange }) {
  return <section className={styles.customerFilter}><div className={`container ${styles.filterInner}`}><strong>Xem bảng giá cho:</strong><div role="tablist" aria-label="Loại khách hàng">{pricingConfig.customerTypes.map((type) => { const Icon = icons[type.id]; return <button key={type.id} type="button" role="tab" aria-selected={value === type.id} className={value === type.id ? styles.activeTab : ""} onClick={() => onChange(type.id)}><Icon /> {type.label}</button>; })}</div></div></section>;
}
