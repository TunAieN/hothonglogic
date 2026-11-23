const CART_PREFIX = "viettrung:customer-cart:v1:";
const SUBMISSION_PREFIX = "viettrung:customer-cart-submit:v1:";
const DRAFT_PREFIX = "viettrung:customer-cart-drafts:v1:";
const CART_EVENT = "viettrung:customer-cart-changed";
const DRAFT_EVENT = "viettrung:customer-cart-drafts-changed";
const MAX_ITEMS = 100;
const MAX_DRAFTS = 20;

export class CustomerCartStorageError extends Error {
  constructor(code, message, cause) {
    super(message, { cause });
    this.name = "CustomerCartStorageError";
    this.code = code;
  }
}

const customerKey = (customerId, prefix = CART_PREFIX) => {
  const normalized = String(customerId ?? "").trim();
  if (!/^\d+$/.test(normalized)) throw new CustomerCartStorageError("CUSTOMER_REQUIRED", "Không xác định được tài khoản để lưu giỏ hàng.");
  return `${prefix}${normalized}`;
};

const now = () => new Date().toISOString();
const id = () => globalThis.crypto?.randomUUID?.() || `cart-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const nullablePrice = (value) => value === "" || value == null || !Number.isFinite(Number(value)) ? null : Math.max(0, Number(value));
const attributes = (value) => Object.fromEntries(Object.entries(value || {}).filter(([key, entry]) => text(key, 100) && text(entry, 255)).map(([key, entry]) => [text(key, 100), text(entry, 255)]).sort(([left], [right]) => left.localeCompare(right)));

const normalizeItem = (input, existing = null, touch = true) => ({
  local_item_id: text(existing?.local_item_id || input.local_item_id || id(), 100),
  product_url: text(input.product_url, 4000),
  platform: text(input.platform, 30),
  title: text(input.title, 255),
  main_image: text(input.main_image, 4000) || null,
  sku_id: text(input.sku_id, 255) || null,
  selected_attributes: attributes(input.selected_attributes),
  variant_label: text(input.variant_label, 500) || null,
  color: text(input.color, 255) || null,
  size: text(input.size, 255) || null,
  quantity: Math.min(100000, Math.max(1, Number.parseInt(input.quantity, 10) || 1)),
  reference_price_cny: nullablePrice(input.reference_price_cny),
  product_note: text(input.product_note, 2000) || null,
  seller: text(input.seller, 255) || null,
  shop_name: text(input.shop_name, 255) || null,
  sku_required: input.sku_required === true,
  created_at: existing?.created_at || input.created_at || now(),
  updated_at: touch ? now() : (input.updated_at || existing?.updated_at || now()),
});

const emptyDocument = () => ({ version: 1, items: [], request_note: "", updated_at: now() });
const parseDocument = (raw) => {
  if (!raw) return emptyDocument();
  try {
    const value = JSON.parse(raw);
    if (!value || !Array.isArray(value.items)) return emptyDocument();
    return { version: 1, items: value.items.slice(0, MAX_ITEMS).map((item) => normalizeItem(item, item, false)).filter((item) => item.title && item.product_url), request_note: text(value.request_note, 2000), updated_at: value.updated_at || now() };
  } catch {
    return emptyDocument();
  }
};

const read = (customerId) => {
  try { return parseDocument(localStorage.getItem(customerKey(customerId))); }
  catch (error) {
    if (error instanceof CustomerCartStorageError) throw error;
    throw new CustomerCartStorageError("STORAGE_UNAVAILABLE", "Trình duyệt đang chặn lưu giỏ hàng. Hãy cho phép dữ liệu website rồi thử lại.", error);
  }
};

const publish = (customerId, document) => {
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: { customerId: String(customerId), document } }));
  window.dispatchEvent(new CustomEvent("viettrung:cart-updated", { detail: { customerId: String(customerId), count: document.items.length } }));
};

const write = (customerId, document) => {
  const next = { ...document, version: 1, updated_at: now() };
  try { localStorage.setItem(customerKey(customerId), JSON.stringify(next)); }
  catch (error) { throw new CustomerCartStorageError("STORAGE_WRITE_FAILED", "Không thể lưu giỏ hàng trên trình duyệt. Bộ nhớ có thể đã đầy hoặc bị chặn.", error); }
  publish(customerId, next);
  return next;
};

const identity = (item) => JSON.stringify([item.product_url, item.sku_id || "", attributes(item.selected_attributes), item.product_note || ""]);

export const getCart = (customerId) => read(customerId);

export const addItem = (customerId, input) => {
  const document = read(customerId);
  const incoming = normalizeItem(input);
  if (!incoming.product_url || !incoming.title) throw new CustomerCartStorageError("INVALID_ITEM", "Sản phẩm cần có link nguồn và tên hợp lệ.");
  if (incoming.sku_required && !incoming.sku_id) throw new CustomerCartStorageError("SKU_REQUIRED", "Vui lòng chọn đầy đủ SKU trước khi thêm vào giỏ.");
  const matched = document.items.find((item) => identity(item) === identity(incoming));
  const items = matched
    ? document.items.map((item) => item.local_item_id === matched.local_item_id ? normalizeItem({ ...item, quantity: item.quantity + incoming.quantity }, item) : item)
    : [...document.items, incoming];
  if (items.length > MAX_ITEMS) throw new CustomerCartStorageError("CART_LIMIT", `Giỏ hàng chỉ hỗ trợ tối đa ${MAX_ITEMS} dòng sản phẩm.`);
  const next = write(customerId, { ...document, items });
  return { document: next, item: next.items.find((item) => item.local_item_id === (matched?.local_item_id || incoming.local_item_id)), merged: Boolean(matched) };
};

export const updateItem = (customerId, localItemId, patch) => {
  const document = read(customerId);
  let found = false;
  const items = document.items.map((item) => {
    if (item.local_item_id !== localItemId) return item;
    found = true;
    return normalizeItem({ ...item, ...patch }, item);
  });
  if (!found) throw new CustomerCartStorageError("ITEM_NOT_FOUND", "Sản phẩm không còn trong giỏ hàng.");
  return write(customerId, { ...document, items });
};

export const removeItem = (customerId, localItemId) => {
  const document = read(customerId);
  return write(customerId, { ...document, items: document.items.filter((item) => item.local_item_id !== localItemId) });
};

export const clearCart = (customerId) => write(customerId, emptyDocument());
export const updateRequestNote = (customerId, requestNote) => write(customerId, { ...read(customerId), request_note: text(requestNote, 2000) });

export const getTotals = (items) => {
  const list = Array.isArray(items) ? items : [];
  return {
    itemCount: list.length,
    totalQuantity: list.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    knownTotalCny: list.reduce((sum, item) => item.reference_price_cny == null ? sum : sum + Number(item.reference_price_cny) * Number(item.quantity || 0), 0),
    unknownPriceCount: list.filter((item) => item.reference_price_cny == null).length,
  };
};

export const subscribe = (customerId, listener) => {
  const key = customerKey(customerId);
  const sameCustomer = String(customerId);
  const onLocal = (event) => { if (event.detail?.customerId === sameCustomer) listener(event.detail.document); };
  const onStorage = (event) => { if (event.key === key) listener(parseDocument(event.newValue)); };
  window.addEventListener(CART_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(CART_EVENT, onLocal); window.removeEventListener("storage", onStorage); };
};

const parseDrafts = (raw) => {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.slice(0, MAX_DRAFTS).map((draft) => ({
      draft_id: text(draft.draft_id, 100),
      title: text(draft.title, 150) || "Bản nháp mua hộ",
      request_note: text(draft.request_note, 2000),
      items: Array.isArray(draft.items) ? draft.items.slice(0, MAX_ITEMS).map((item) => normalizeItem(item, item, false)).filter((item) => item.title && item.product_url) : [],
      created_at: draft.created_at || now(), updated_at: draft.updated_at || draft.created_at || now(),
    })).filter((draft) => draft.draft_id && draft.items.length);
  } catch { return []; }
};

export const getDrafts = (customerId) => {
  try { return parseDrafts(localStorage.getItem(customerKey(customerId, DRAFT_PREFIX))); }
  catch (error) { throw new CustomerCartStorageError("STORAGE_UNAVAILABLE", "Không thể đọc bản nháp trên trình duyệt.", error); }
};

const writeDrafts = (customerId, drafts) => {
  const next = drafts.slice(0, MAX_DRAFTS);
  try { localStorage.setItem(customerKey(customerId, DRAFT_PREFIX), JSON.stringify(next)); }
  catch (error) { throw new CustomerCartStorageError("STORAGE_WRITE_FAILED", "Không thể lưu bản nháp trên trình duyệt.", error); }
  window.dispatchEvent(new CustomEvent(DRAFT_EVENT, { detail: { customerId: String(customerId), drafts: next } }));
  return next;
};

export const saveDraft = (customerId, items, requestNote = "", title = "") => {
  if (!Array.isArray(items) || !items.length) throw new CustomerCartStorageError("EMPTY_DRAFT", "Hãy chọn ít nhất một sản phẩm để lưu bản nháp.");
  const timestamp = now();
  const draft = { draft_id: id(), title: text(title, 150) || `Bản nháp ${new Date().toLocaleString("vi-VN")}`, request_note: text(requestNote, 2000), items: items.map((item) => normalizeItem(item, item, false)), created_at: timestamp, updated_at: timestamp };
  writeDrafts(customerId, [draft, ...getDrafts(customerId)]);
  return draft;
};

export const deleteDraft = (customerId, draftId) => writeDrafts(customerId, getDrafts(customerId).filter((draft) => draft.draft_id !== draftId));

export const restoreDraftToCart = (customerId, draftId) => {
  const draft = getDrafts(customerId).find((entry) => entry.draft_id === draftId);
  if (!draft) throw new CustomerCartStorageError("DRAFT_NOT_FOUND", "Bản nháp không còn tồn tại.");
  draft.items.forEach((item) => addItem(customerId, item));
  if (draft.request_note && !getCart(customerId).request_note) updateRequestNote(customerId, draft.request_note);
  return getCart(customerId);
};

export const subscribeDrafts = (customerId, listener) => {
  const key = customerKey(customerId, DRAFT_PREFIX);
  const sameCustomer = String(customerId);
  const onLocal = (event) => { if (event.detail?.customerId === sameCustomer) listener(event.detail.drafts); };
  const onStorage = (event) => { if (event.key === key) listener(parseDrafts(event.newValue)); };
  window.addEventListener(DRAFT_EVENT, onLocal); window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(DRAFT_EVENT, onLocal); window.removeEventListener("storage", onStorage); };
};

const snapshotSignature = (items, requestNote) => JSON.stringify({ note: text(requestNote, 2000), items: items.map((item) => [item.local_item_id, item.updated_at, item.quantity]) });

export const getOrCreateSubmission = (customerId, items, requestNote) => {
  const key = customerKey(customerId, SUBMISSION_PREFIX);
  const signature = snapshotSignature(items, requestNote);
  try {
    const existing = JSON.parse(localStorage.getItem(key) || "null");
    if (existing?.signature === signature && existing?.idempotency_key) return existing;
    const submission = { idempotency_key: id(), signature, created_at: now() };
    localStorage.setItem(key, JSON.stringify(submission));
    return submission;
  } catch (error) { throw new CustomerCartStorageError("SUBMISSION_STORAGE_FAILED", "Không thể tạo khóa gửi yêu cầu an toàn trên trình duyệt.", error); }
};

export const removeSubmittedSnapshot = (customerId, snapshot, idempotencyKey) => {
  const document = read(customerId);
  const submitted = new Map(snapshot.map((item) => [item.local_item_id, item.updated_at]));
  const items = document.items.filter((item) => submitted.get(item.local_item_id) !== item.updated_at);
  const next = write(customerId, { ...document, items });
  try {
    const key = customerKey(customerId, SUBMISSION_PREFIX);
    const pending = JSON.parse(localStorage.getItem(key) || "null");
    if (pending?.idempotency_key === idempotencyKey) localStorage.removeItem(key);
  } catch { /* successful order must not be reported as failed because cleanup metadata is unavailable */ }
  return next;
};

export const __testing = { CART_PREFIX, SUBMISSION_PREFIX, DRAFT_PREFIX, parseDocument, parseDrafts, identity };
