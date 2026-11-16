import { createContext, useContext, useMemo, useState } from "react";
import { customerPortalRuntime } from "../../config/customerPortal.js";
import { customerPortalDemoData } from "../../data/customerPortalDemo.js";

const DemoPortalContext = createContext(null);
const storageKey = "viettrung-customer-portal-demo-data-v1";

const initialExtras = {
  cart: [{ id: "cart-demo-1", source: "Taobao", name: "Áo sơ mi demo", sourceUrl: "https://example.invalid/demo-product", link: "https://example.invalid/demo-product", variant: "Trắng / L", quantity: 2, priceCny: 86, color: "Trắng", size: "L", imageUrl: "/images/hero/3-20210510015239-e_5fa65.jpg", images: ["/images/hero/3-20210510015239-e_5fa65.jpg"], metadataSource: "demo", metadataStatus: "success" }],
  drafts: [{ id: "draft-demo-1", title: "Nháp phụ kiện cửa hàng", createdAt: "2026-11-02T09:30:00+07:00", addressId: "demo-address-2", items: [{ id: "draft-item-1", source: "1688", name: "Móc treo demo", sourceUrl: "https://example.invalid/draft-product", link: "https://example.invalid/draft-product", variant: "Bộ 20", quantity: 2, priceCny: 45, imageUrl: "/images/hero/khovan_hvdn.jpg", images: ["/images/hero/khovan_hvdn.jpg"], metadataSource: "demo", metadataStatus: "success" }] }],
  supportRequests: [{ id: "support-demo-1", code: "HT-DEMO-001", type: "order", orderCode: "DEMO260002", title: "Hỏi về tiến độ đơn minh họa", content: "Yêu cầu này chỉ dùng để kiểm tra giao diện.", status: "open", createdAt: "2026-11-01T08:30:00+07:00" }],
  preferences: { orderNotifications: true, shippingNotifications: true, financeNotifications: false, language: "vi", displayDensity: "comfortable" },
};

function loadInitialState() {
  const fallback = { ...customerPortalDemoData, ...initialExtras };
  if (!customerPortalRuntime.demoEnabled) return fallback;
  try {
    const saved = window.sessionStorage.getItem(storageKey);
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch {
    return fallback;
  }
}

export function DemoPortalProvider({ children }) {
  const [state, setState] = useState(loadInitialState);

  const commit = (updater) => setState((current) => {
    const next = typeof updater === "function" ? updater(current) : updater;
    if (customerPortalRuntime.demoEnabled) {
      try { window.sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Demo remains memory-only when storage is unavailable. */ }
    }
    return next;
  });

  const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const addCartItem = (item) => commit((current) => ({ ...current, cart: [...current.cart, { ...item, id: makeId("cart") }] }));
  const updateCartItem = (id, patch) => commit((current) => ({ ...current, cart: current.cart.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  const removeCartItem = (id) => commit((current) => ({ ...current, cart: current.cart.filter((item) => item.id !== id) }));
  const saveDraft = ({ id, items, addressId, title = "Yêu cầu mua hộ chưa gửi" }) => {
    const draft = { id: id || makeId("draft"), title, items, addressId, createdAt: new Date().toISOString() };
    commit((current) => ({ ...current, drafts: id ? current.drafts.map((item) => item.id === id ? draft : item) : [draft, ...current.drafts] }));
    return draft;
  };
  const deleteDraft = (id) => commit((current) => ({ ...current, drafts: current.drafts.filter((item) => item.id !== id) }));
  const submitOrder = ({ items, addressId, draftId, title }) => {
    const now = new Date().toISOString();
    const totalVnd = items.reduce((sum, item) => sum + (Number(item.priceCny) || 0) * 3500 * (Number(item.quantity) || 1), 0);
    const order = {
      id: makeId("demo-order"), code: `DEMO${String(Date.now()).slice(-6)}`, product: title || items[0]?.name || "Yêu cầu mua hộ Demo",
      source: [...new Set(items.map((item) => item.source))].join(", "), quantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      totalVnd, paidVnd: 0, status: "pending", createdAt: now, updatedAt: now, addressId,
      items: items.map((item) => ({ ...item, id: item.id || makeId("item"), unitPriceVnd: (Number(item.priceCny) || 0) * 3500, variant: item.variant || [item.color, item.size].filter(Boolean).join(" / ") || "Theo yêu cầu" })),
    };
    commit((current) => ({ ...current, orders: [order, ...current.orders], drafts: draftId ? current.drafts.filter((item) => item.id !== draftId) : current.drafts, notifications: [{ id: makeId("note"), type: "order", title: `Đã tạo yêu cầu Demo ${order.code}`, body: "Yêu cầu chỉ tồn tại trong Development Demo Mode.", unread: true, orderId: order.id, createdAt: now }, ...current.notifications] }));
    return order;
  };
  const submitCart = () => {
    if (!state.cart.length) return null;
    const order = submitOrder({ items: state.cart, title: state.cart[0].name });
    commit((current) => ({ ...current, cart: [] }));
    return order;
  };
  const addConsignment = (input) => commit((current) => ({ ...current, consignments: [{ id: makeId("demo-consignment"), tracking: input.tracking, name: input.name, declaredAt: new Date().toISOString(), weight: Number(input.weight) || 0, quantity: Number(input.quantity) || 1, category: input.category, volume: Number(input.volume) || null, inspection: Boolean(input.inspection), packing: Boolean(input.packing), notes: input.notes, status: "receiving", feeVnd: null }, ...current.consignments] }));
  const markNotificationRead = (id) => commit((current) => ({ ...current, notifications: current.notifications.map((item) => item.id === id ? { ...item, unread: false } : item) }));
  const addSupportRequest = (input) => commit((current) => ({ ...current, supportRequests: [{ ...input, id: makeId("support"), code: `HT-DEMO-${String(Date.now()).slice(-4)}`, status: "open", createdAt: new Date().toISOString() }, ...current.supportRequests] }));
  const updateProfile = (patch) => commit((current) => ({ ...current, profile: { ...current.profile, ...patch } }));
  const updatePreferences = (patch) => commit((current) => ({ ...current, preferences: { ...current.preferences, ...patch } }));

  const data = useMemo(() => ({ ...state, summary: { ...state.summary, processingOrders: state.orders.filter((item) => !["completed", "cancelled"].includes(item.status)).length, shippingPackages: state.consignments.filter((item) => item.status === "shipped").length } }), [state]);
  const value = { data, addCartItem, updateCartItem, removeCartItem, saveDraft, deleteDraft, submitOrder, submitCart, addConsignment, markNotificationRead, addSupportRequest, updateProfile, updatePreferences };

  return <DemoPortalContext.Provider value={value}>{children}</DemoPortalContext.Provider>;
}

// Context hook intentionally lives beside its provider to keep the Demo Store self-contained.
// eslint-disable-next-line react-refresh/only-export-components
export function useDemoPortal() {
  const context = useContext(DemoPortalContext);
  if (!context) throw new Error("useDemoPortal must be used inside DemoPortalProvider");
  return context;
}
