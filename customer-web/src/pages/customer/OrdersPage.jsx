import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { orderStatusMap } from "../../utils/customerFormatters.js";
import { OrderTable, PageHeader } from "../../components/customer/PortalComponents.jsx";
import styles from "../../components/customer/CustomerPortal.module.css";

const pageSize = 4;
export default function OrdersPage({ data, historyMode = false }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [page, setPage] = useState(1);
  const sources = [...new Set(data.orders.map((order) => order.source))];
  const statuses = [...new Set(data.orders.map((order) => order.status))];
  const filtered = useMemo(() => data.orders.filter((order) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${order.code} ${order.product} ${order.source}`.toLowerCase().includes(query);
    return matchesSearch && (status === "all" || order.status === status) && (source === "all" || order.source === source);
  }), [data.orders, search, source, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleOrders = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const updateFilter = (setter) => (event) => { setter(event.target.value); setPage(1); };
  const resetFilters = () => { setSearch(""); setStatus("all"); setSource("all"); setPage(1); };

  return <>
    <PageHeader title={historyMode ? "Lịch sử đơn hàng" : "Đơn hàng mua hộ"} description={historyMode ? "Xem lại toàn bộ yêu cầu và đơn Demo theo thời gian." : "Tra cứu và theo dõi các đơn mua hộ thuộc tài khoản khách hàng."} />
    <div className={styles.tabs} aria-label="Lọc nhanh trạng thái"><button type="button" className={status === "all" ? styles.active : ""} onClick={() => { setStatus("all"); setPage(1); }}>Tất cả ({data.orders.length})</button>{statuses.map((item) => <button type="button" key={item} className={status === item ? styles.active : ""} onClick={() => { setStatus(item); setPage(1); }}>{orderStatusMap[item]?.label || item}</button>)}</div>
    <div className={styles.toolbar}><label className={styles.searchBox}><Search aria-hidden="true" /><span className="srOnly">Tìm kiếm đơn hàng</span><input value={search} onChange={updateFilter(setSearch)} placeholder="Tìm mã đơn, sản phẩm, nguồn hàng..." /></label><select className={styles.select} value={source} onChange={updateFilter(setSource)} aria-label="Lọc theo nguồn hàng"><option value="all">Tất cả nguồn hàng</option>{sources.map((item) => <option key={item} value={item}>{item}</option>)}</select><select className={styles.select} value={status} onChange={updateFilter(setStatus)} aria-label="Lọc theo trạng thái"><option value="all">Tất cả trạng thái</option>{statuses.map((item) => <option key={item} value={item}>{orderStatusMap[item]?.label || item}</option>)}</select><button type="button" className={styles.secondaryAction} onClick={resetFilters}>Xóa bộ lọc</button></div>
    <section className={styles.panel} aria-label="Danh sách đơn hàng"><OrderTable orders={visibleOrders} /><footer className={styles.pagination}><span>Hiển thị {visibleOrders.length} / {filtered.length} đơn</span><div><button type="button" disabled={safePage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Trước</button><button type="button" disabled={safePage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Sau</button></div></footer></section>
  </>;
}
