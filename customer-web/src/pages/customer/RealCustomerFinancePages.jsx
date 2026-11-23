import { useCallback, useEffect, useState } from "react";
import { Calculator, CreditCard, LoaderCircle, RefreshCw, WalletCards } from "lucide-react";
import {
  createCustomerTopupIntent, createVoucherSepayIntent, estimateCustomerPricing,
  getCustomerFinanceSummary, getCustomerLedger, getCustomerPaymentIntent,
  getCustomerPaymentVouchers, getCustomerPricing, payVoucherFromWallet,
} from "../../api/customerPortal.js";
import { EmptyState, LoadingState, PageHeader } from "../../components/customer/PortalComponents.jsx";
import { formatDateTime, formatVnd } from "../../utils/customerFormatters.js";
import styles from "../../components/customer/CustomerPortal.module.css";
import feature from "../../components/customer/CustomerPortalFeatures.module.css";

const idempotencyKey = () => globalThis.crypto?.randomUUID?.() || `portal-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function ErrorMessage({ message, retry }) {
  return message ? <p className={feature.error} role="alert">{message} {retry && <button type="button" className={feature.ghost} onClick={retry}><RefreshCw /> Thử lại</button>}</p> : null;
}

function PaymentQr({ intent, onCompleted }) {
  const [current, setCurrent] = useState(intent);
  useEffect(() => {
    if (!intent || intent.status !== "pending") return undefined;
    const timer = setInterval(() => getCustomerPaymentIntent(intent.reference).then(({ intent: next }) => {
      setCurrent(next);
      if (next.status === "completed") onCompleted?.();
    }).catch(() => {}), 3000);
    return () => clearInterval(timer);
  }, [intent, onCompleted]);
  if (!current) return null;
  return <section className={feature.qrCard} aria-live="polite">
    <div>{current.qr_url && <img src={current.qr_url} alt={`QR thanh toán ${current.reference}`} />}</div>
    <dl><div><dt>Số tiền</dt><dd>{formatVnd(current.amount_vnd)}</dd></div><div><dt>Ngân hàng</dt><dd>{current.bank?.name || "—"}</dd></div><div><dt>Số tài khoản</dt><dd>{current.bank?.account_number || "—"}</dd></div><div><dt>Nội dung bắt buộc</dt><dd><code>{current.reference}</code></dd></div><div><dt>Trạng thái</dt><dd>{current.status === "pending" ? "Đang chờ chuyển khoản" : current.status === "completed" ? "Đã xác nhận" : "Đã hết hiệu lực"}</dd></div></dl>
  </section>;
}

export function RealWalletPage() {
  const [summary, setSummary] = useState(null); const [ledger, setLedger] = useState([]); const [error, setError] = useState("");
  const [amount, setAmount] = useState(""); const [busy, setBusy] = useState(false); const [intent, setIntent] = useState(null);
  const load = useCallback(async () => { await Promise.resolve(); setError(""); try { const [s, l] = await Promise.all([getCustomerFinanceSummary(), getCustomerLedger({ per_page: 50 })]); setSummary(s); setLedger(l.data); } catch (reason) { setError(reason.message || "Không thể tải dữ liệu ví."); } }, []);
  useEffect(() => {
    let active = true;
    Promise.all([getCustomerFinanceSummary(), getCustomerLedger({ per_page: 50 })])
      .then(([s, l]) => { if (active) { setSummary(s); setLedger(l.data); } })
      .catch((reason) => { if (active) setError(reason.message || "Không thể tải dữ liệu ví."); });
    return () => { active = false; };
  }, []);
  const createIntent = async (event) => { event.preventDefault(); setBusy(true); setError(""); try { const result = await createCustomerTopupIntent({ amount_vnd: Number(amount), idempotency_key: idempotencyKey() }); setIntent(result.intent); } catch (reason) { setError(reason.message); } finally { setBusy(false); } };
  return <><PageHeader title="Ví & giao dịch" description="Số dư và lịch sử lấy trực tiếp từ sổ cái tài chính của tài khoản." />
    <div className={styles.walletHero}><section className={styles.walletBalance}><WalletCards /><small>Số dư khả dụng</small><strong>{formatVnd(summary?.balance_vnd)}</strong><footer><a href="#nap-tien">Nạp tiền qua SePay</a></footer></section><section className={styles.summaryCard}><CreditCard /><h2>Công nợ cần thanh toán</h2><div className={styles.summaryRows}><div><span>Tổng còn phải trả</span><strong>{formatVnd(summary?.outstanding_vnd)}</strong></div></div></section></div>
    <section id="nap-tien" className={feature.contentCard}><header className={feature.cardHeader}><h2>Nạp tiền vào ví</h2><p>Nhập số tiền nguyên VND. Số dư chỉ tăng sau khi webhook SePay hợp lệ khớp đúng tài khoản, nội dung và số tiền.</p></header><form className={feature.inlineForm} onSubmit={createIntent}><label className={feature.field}><span>Số tiền muốn nạp</span><input type="number" min="1000" step="1000" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ví dụ 500000" /></label><button className={feature.primary} disabled={busy || !summary?.sepay_available}>{busy ? <LoaderCircle className={feature.spin} /> : null}Tạo mã QR</button></form>{!summary?.sepay_available && summary && <p className={feature.notice}>Kênh SePay đang tắt. Không có QR thanh toán nào được tạo.</p>}<ErrorMessage message={error} retry={load} /><PaymentQr key={intent?.reference || "no-wallet-intent"} intent={intent} onCompleted={load} /></section>
    <section className={styles.panel}><h2>Lịch sử số dư</h2>{!summary && !error ? <LoadingState /> : ledger.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Thời gian</th><th>Nội dung</th><th>Biến động</th><th>Số dư sau giao dịch</th></tr></thead><tbody>{ledger.map((item) => <tr key={item.id}><td>{formatDateTime(item.created_at)}</td><td>{item.description}</td><td className={item.type === "debit" ? styles.danger : styles.success}>{item.type === "debit" ? "−" : "+"}{formatVnd(item.amount_vnd)}</td><td>{formatVnd(item.balance_after_vnd)}</td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có giao dịch" description="Các biến động đã xác nhận sẽ xuất hiện tại đây." />}</section>
  </>;
}

export function RealOrderPaymentsPage() {
  const [summary, setSummary] = useState(null); const [vouchers, setVouchers] = useState([]); const [error, setError] = useState(""); const [busy, setBusy] = useState(null); const [intent, setIntent] = useState(null);
  const load = useCallback(async () => { await Promise.resolve(); setError(""); try { const [s, v] = await Promise.all([getCustomerFinanceSummary(), getCustomerPaymentVouchers({ per_page: 100 })]); setSummary(s); setVouchers(v.data); } catch (reason) { setError(reason.message || "Không thể tải phiếu thanh toán."); } }, []);
  useEffect(() => {
    let active = true;
    Promise.all([getCustomerFinanceSummary(), getCustomerPaymentVouchers({ per_page: 100 })])
      .then(([s, v]) => { if (active) { setSummary(s); setVouchers(v.data); } })
      .catch((reason) => { if (active) setError(reason.message || "Không thể tải phiếu thanh toán."); });
    return () => { active = false; };
  }, []);
  const walletPay = async (voucher) => { setBusy(`wallet-${voucher.id}`); setError(""); try { await payVoucherFromWallet(voucher.id, { idempotency_key: idempotencyKey() }); await load(); } catch (reason) { setError(reason.message); } finally { setBusy(null); } };
  const sepayPay = async (voucher) => { setBusy(`sepay-${voucher.id}`); setError(""); try { const result = await createVoucherSepayIntent(voucher.id, { idempotency_key: idempotencyKey() }); setIntent(result.intent); } catch (reason) { setError(reason.message); } finally { setBusy(null); } };
  return <><PageHeader title="Thanh toán đơn hàng" description="Thanh toán toàn bộ số tiền còn lại bằng số dư ví hoặc chuyển khoản SePay." /><div className={feature.summaryGrid}><div className={feature.summaryCard}><small>Số dư ví</small><h2>{formatVnd(summary?.balance_vnd)}</h2></div><div className={feature.summaryCard}><small>Công nợ</small><h2>{formatVnd(summary?.outstanding_vnd)}</h2></div></div><ErrorMessage message={error} retry={load} /><PaymentQr key={intent?.reference || "no-voucher-intent"} intent={intent} onCompleted={load} /><section className={styles.panel}>{!summary && !error ? <LoadingState /> : vouchers.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Mã phiếu</th><th>Ngày tạo</th><th>Trạng thái</th><th>Còn lại</th><th>Thao tác</th></tr></thead><tbody>{vouchers.map((voucher) => <tr key={voucher.id}><td><strong>{voucher.code}</strong></td><td>{formatDateTime(voucher.created_at)}</td><td>{voucher.status}</td><td>{formatVnd(voucher.remaining_vnd)}</td><td><div className={feature.rowActions}>{voucher.remaining_vnd > 0 ? <><button type="button" className={feature.secondary} disabled={busy || summary.balance_vnd < voucher.remaining_vnd} onClick={() => walletPay(voucher)}>{busy === `wallet-${voucher.id}` ? "Đang xử lý..." : "Dùng số dư"}</button><button type="button" className={feature.primary} disabled={busy || !summary.sepay_available} onClick={() => sepayPay(voucher)}>{busy === `sepay-${voucher.id}` ? "Đang tạo QR..." : "Chuyển khoản"}</button></> : "Đã thanh toán"}</div></td></tr>)}</tbody></table></div> : <EmptyState title="Chưa có phiếu thanh toán" description="Phiếu thuộc tài khoản của bạn sẽ xuất hiện tại đây." />}</section></>;
}

export function RealCustomerPricingPage() {
  const [config, setConfig] = useState(null); const [form, setForm] = useState({ product_price_cny: "", quantity: "1", weight_kg: "" }); const [result, setResult] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { getCustomerPricing().then(setConfig).catch((reason) => setError(reason.message)); }, []);
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(""); setResult(null); try { const data = await estimateCustomerPricing(form); setResult(data.estimate); } catch (reason) { setError(reason.message); } finally { setBusy(false); } };
  return <><PageHeader title="Bảng giá & ước tính chi phí" description="Dữ liệu tỷ giá và cước đang hiệu lực lấy trực tiếp từ hệ thống nghiệp vụ." /><div className={feature.pricingLayout}><section className={feature.contentCard}><header className={feature.cardHeader}><h2>Cấu hình đang áp dụng</h2></header><div className={feature.priceCategories}><div className={feature.priceCategory}><CreditCard /><div><strong>Tỷ giá CNY/VND</strong><small>{config?.exchange_rate ? `Hiệu lực ${formatDateTime(config.exchange_rate.effective_from)}` : "Chưa có tỷ giá active"}</small></div><span>{config?.exchange_rate?.rate || "Không có"}</span></div><div className={feature.priceCategory}><WalletCards /><div><strong>Cước vận chuyển</strong><small>{config?.shipping_rate?.name || "Chưa có bảng cước active"}</small></div><span>{config?.shipping_rate?.details?.length || 0} khung</span></div></div></section><aside className={feature.contentCard}><header className={feature.cardHeader}><h2>Lưu ý</h2><p>Ước tính không tự điền 0 cho phí chưa được cấu hình và không phải báo giá chốt đơn.</p></header></aside></div><section className={feature.calculator}><form className={feature.calculatorInput} onSubmit={submit}><header className={feature.cardHeader}><h2>Nhập thông tin</h2></header><div className={feature.formGrid}><label className={feature.field}><span>Giá sản phẩm (CNY)</span><input required inputMode="decimal" value={form.product_price_cny} onChange={(e) => setForm({ ...form, product_price_cny: e.target.value })} /></label><label className={feature.field}><span>Số lượng</span><input required type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label><label className={feature.field}><span>Trọng lượng (kg)</span><input required inputMode="decimal" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} /></label></div><div className={feature.actions}><button className={feature.primary} disabled={busy}><Calculator />{busy ? "Đang tính..." : "Ước tính"}</button></div><ErrorMessage message={error} /></form><aside className={feature.calculatorResult}><header className={feature.cardHeader}><h2>Kết quả</h2></header><div className={feature.breakdown}><div><span>Tiền hàng</span><strong>{formatVnd(result?.goods_value_vnd)}</strong></div><div><span>Phí vận chuyển</span><strong>{formatVnd(result?.shipping_fee_vnd)}</strong></div><div><span>Phí mua hộ</span><strong>{result ? "Chưa cấu hình" : "—"}</strong></div><div><span>Tổng các khoản đã biết</span><strong>{formatVnd(result?.known_total_vnd)}</strong></div></div>{result?.notice && <p className={feature.notice}>{result.notice}</p>}</aside></section></>;
}
