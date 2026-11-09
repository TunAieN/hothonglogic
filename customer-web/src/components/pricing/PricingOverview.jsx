import { CircleDollarSign, Coins } from "lucide-react";
import { pricingConfig } from "../../data/pricingConfig.js";
import styles from "./PricingPage.module.css";

function ExchangeRateCard() {
  const { exchangeRate } = pricingConfig;
  return <article className={styles.rateCard}><div className={styles.cardTitle}><span><CircleDollarSign /></span><div><h2>Tỷ giá Nhân dân tệ (CNY/VND)</h2><p>Nguồn dữ liệu khách hàng chưa được kết nối.</p></div></div><strong>{exchangeRate.value ? `1 CNY = ${exchangeRate.value.toLocaleString("vi-VN")} VNĐ` : "Tỷ giá đang được cập nhật"}</strong><small>{exchangeRate.updatedAt ? `Cập nhật: ${exchangeRate.updatedAt}` : "Chưa có thời gian cập nhật đã xác minh."}</small></article>;
}

function PurchaseFeeTable({ customerType }) {
  const rules = pricingConfig.purchaseFeeRules[customerType] || [];
  return <article className={styles.purchaseCard}><div className={styles.cardTitle}><span><Coins /></span><div><h2>Phí dịch vụ mua hộ</h2><p>{customerType === "wholesale" ? "Khách sỉ và ký gửi cần báo giá theo nhu cầu." : "Phí dự kiến tính theo quy tắc giá trị đơn hàng."}</p></div></div><div className={styles.tableWrap}><table><thead><tr><th>Giá trị đơn hàng</th><th>Phí dịch vụ</th><th>Ghi chú</th></tr></thead><tbody>{rules.length ? rules.map((rule) => <tr key={rule.id}><td>{rule.label}</td><td>{rule.displayValue}</td><td>{rule.note || "—"}</td></tr>) : <tr><td colSpan="3" className={styles.emptyCell}>Chưa có mức phí đã xác minh. Liên hệ nhận báo giá.</td></tr>}</tbody></table></div></article>;
}

export default function PricingOverview({ customerType }) {
  return <section className={`section ${styles.overview}`}><div className={`container ${styles.overviewGrid}`}><ExchangeRateCard /><PurchaseFeeTable customerType={customerType} /></div></section>;
}
