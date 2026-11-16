import { useState } from "react";
import { Package, Pencil, ShoppingCart } from "lucide-react";
import { PageHeader } from "../../components/customer/PortalComponents.jsx";
import { useDemoPortal } from "../../components/customer/DemoPortalContext.jsx";
import ProductThumbnail from "../../components/customer/ProductThumbnail.jsx";
import { formatDateTime } from "../../utils/customerFormatters.js";
import feature from "../../components/customer/CustomerPortalFeatures.module.css";

export default function CartAndDraftsPage({ routes }) {
  const { data, updateCartItem, removeCartItem, deleteDraft, submitCart, submitOrder } = useDemoPortal();
  const [tab, setTab] = useState("cart");
  const [message, setMessage] = useState("");
  const totalQuantity = data.cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const referenceTotal = data.cart.reduce((sum, item) => sum + Number(item.priceCny || 0) * Number(item.quantity || 0), 0);
  const submitDraft = (draft) => {
    const order = submitOrder({ ...draft, draftId: draft.id });
    setMessage(`Đã gửi bản nháp thành đơn ${order.code}.`);
  };
  const changeQuantity = (item, value) => updateCartItem(item.id, { quantity: Math.max(1, Number(value) || 1) });

  return <>
    <PageHeader title="Giỏ hàng & bản nháp" description="Kiểm tra sản phẩm trước khi gửi yêu cầu mua hộ Demo." />
    <div className={feature.tabs} role="tablist" aria-label="Nội dung giỏ hàng">
      <button type="button" role="tab" aria-selected={tab === "cart"} onClick={() => setTab("cart")}>Giỏ hàng ({data.cart.length})</button>
      <button type="button" role="tab" aria-selected={tab === "drafts"} onClick={() => setTab("drafts")}>Bản nháp ({data.drafts.length})</button>
    </div>
    {message && <p className={feature.notice} role="status">{message}</p>}
    {tab === "cart" ? <section className={feature.cartPanel}>
      {data.cart.length ? <div className={feature.cartList}>{data.cart.map((item) => <article className={feature.cartItem} key={item.id}>
        <ProductThumbnail src={item.imageUrl} alt={item.name} size="medium" />
        <div className={feature.cartInfo}><strong>{item.name}</strong><p>{item.source} · {item.variant || "Chưa có phân loại"}</p></div>
        <div className={feature.quantityControl} aria-label={`Số lượng ${item.name}`}><button type="button" aria-label="Giảm số lượng" onClick={() => changeQuantity(item, item.quantity - 1)}>−</button><input aria-label="Số lượng" type="number" min="1" value={item.quantity} onChange={(event) => changeQuantity(item, event.target.value)} /><button type="button" aria-label="Tăng số lượng" onClick={() => changeQuantity(item, item.quantity + 1)}>+</button></div>
        <div className={feature.cartPrice}><span>Giá tham khảo</span><strong>{item.priceCny ? `${Number(item.priceCny).toLocaleString("vi-VN")} CNY` : "Chưa có"}</strong></div>
        <button type="button" className={feature.danger} onClick={() => removeCartItem(item.id)}>Xóa</button>
      </article>)}</div> : <div className={feature.compactEmpty}><ShoppingCart aria-hidden="true" /><strong>Giỏ hàng đang trống</strong><p>Thêm sản phẩm để chuẩn bị yêu cầu mua hộ Demo.</p><a className={feature.primary} href={routes.createOrder}>Tạo yêu cầu mua hộ</a></div>}
      {data.cart.length > 0 && <footer className={feature.cartFooter}><div className={feature.cartTotals}><span>Sản phẩm<strong>{data.cart.length}</strong></span><span>Tổng số lượng<strong>{totalQuantity}</strong></span><span>Giá tham khảo<strong>{referenceTotal ? `${referenceTotal.toLocaleString("vi-VN")} CNY` : "Chưa có"}</strong></span></div><div className={feature.actions}><a className={feature.secondary} href={routes.createOrder}>Tiếp tục mua hàng</a><button type="button" className={feature.primary} onClick={() => { const order = submitCart(); if (order) setMessage(`Đã tạo đơn ${order.code} từ giỏ hàng Demo.`); }}>Gửi yêu cầu Demo</button></div></footer>}
    </section> : <section className={feature.draftList}>
      {data.drafts.map((draft) => <article className={feature.draftItem} key={draft.id}><div className={feature.draftProduct}><ProductThumbnail src={draft.items[0]?.imageUrl} alt={draft.items[0]?.name || draft.title} size="medium" /><div><div className={feature.itemHead}><h3>{draft.title}</h3><span className={feature.badge}>Bản nháp</span></div><div className={feature.draftMeta}><span>{draft.items.length} sản phẩm</span><span>Cập nhật {formatDateTime(draft.createdAt)}</span></div></div></div><div className={feature.inlineActions}><a className={feature.secondary} href={`${routes.createOrder}?draft=${draft.id}`}><Pencil aria-hidden="true" />Chỉnh sửa</a><button className={feature.primary} type="button" onClick={() => submitDraft(draft)}>Gửi yêu cầu</button><button className={feature.danger} type="button" onClick={() => deleteDraft(draft.id)}>Xóa</button></div></article>)}
      {!data.drafts.length && <div className={feature.compactEmpty}><Package aria-hidden="true" /><strong>Chưa có bản nháp</strong><p>Các yêu cầu chưa gửi sẽ xuất hiện tại đây.</p></div>}
    </section>}
  </>;
}
