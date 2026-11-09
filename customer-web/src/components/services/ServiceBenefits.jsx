import { serviceBenefits } from "../../data/servicePage.js";
import styles from "./ServicesPageSections.module.css";

export default function ServiceBenefits() {
  return <section className={styles.benefits} aria-label="Lợi ích dịch vụ"><div className={`container ${styles.benefitsGrid}`}>{serviceBenefits.map(({ title, description, icon: Icon }) => <article key={title}><span><Icon /></span><div><h2>{title}</h2><p>{description}</p></div></article>)}</div></section>;
}
