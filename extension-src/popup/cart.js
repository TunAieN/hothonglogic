import { MESSAGE_TYPES } from "../shared/constants.js";
import { getCart, saveCart } from "../storage/cart.js";
import { escapeHtml } from "./ui.js";

let cart = [];
let dependencies;

export async function initializeCart(options) {
  dependencies = options;
  await loadCart();
  document.getElementById("addToCartBtn")?.addEventListener("click", addCurrentProduct);
  document.getElementById("createOrderBtn")?.addEventListener("click", createOrder);
  document.getElementById("clearCartBtn")?.addEventListener("click", clearEntireCart);
  document.getElementById("selectAllProducts")?.addEventListener("change", selectAll);
}

export async function loadCart() {
  cart = await getCart();
  renderCart();
  const badge = document.getElementById("cartBadge");
  badge.textContent = cart.length;
  badge.style.display = cart.length > 0 ? "block" : "none";
}

async function addCurrentProduct() {
  const product = dependencies.getCurrentProduct();
  if (!product?.title) {
    dependencies.showStatus("⚠️ Không có sản phẩm để thêm vào giỏ", "error");
    return;
  }
  const item = {
    ...product,
    quantity: parseInt(document.getElementById("quantity").value, 10) || 1,
    note: document.getElementById("note").value.trim(),
    id: Date.now(),
    addedAt: new Date().toISOString(),
  };
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGE_TYPES.ADD_TO_CART, data: item });
    if (!response?.success) throw new Error(response?.error || "Không thể thêm sản phẩm");
    dependencies.showStatus("✅ Đã thêm vào giỏ hàng", "success");
    await loadCart();
    document.getElementById("quantity").value = 1;
    document.getElementById("note").value = "";
  } catch (error) {
    console.error("Add to cart failed:", error);
    dependencies.showStatus("❌ Lỗi khi thêm vào giỏ", "error");
  }
}

async function removeFromCart(index) {
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGE_TYPES.REMOVE_FROM_CART, index });
    if (!response?.success) throw new Error(response?.error || "Không thể xóa sản phẩm");
    await loadCart();
    dependencies.showStatus("✅ Đã xóa khỏi giỏ hàng", "success");
  } catch (error) {
    console.error("Remove from cart failed:", error);
    dependencies.showStatus("❌ Lỗi khi xóa", "error");
  }
}

async function clearEntireCart() {
  if (!confirm("Bạn có chắc muốn xóa toàn bộ giỏ hàng?")) return;
  try {
    const response = await chrome.runtime.sendMessage({ action: MESSAGE_TYPES.CLEAR_CART });
    if (!response?.success) throw new Error(response?.error || "Không thể xóa giỏ hàng");
    await loadCart();
    dependencies.showStatus("✅ Đã xóa giỏ hàng", "success");
  } catch (error) {
    console.error("Clear cart failed:", error);
    dependencies.showStatus("❌ Lỗi khi xóa giỏ hàng", "error");
  }
}

function buildVariantSummary(item) {
  const parts = [];
  if (item.size && item.size !== "N/A") parts.push(`Kích thước: ${item.size}`);
  if (item.color && item.color !== "N/A") parts.push(`Màu sắc: ${item.color}`);
  if (item.seller) parts.push(`Shop: ${item.seller}`);
  return parts.join(" | ");
}

export function buildDraftPayload(customerId = "") {
  return {
    source: "chrome-extension",
    customer_id: customerId || null,
    order_note: "",
    created_at: new Date().toISOString(),
    items: cart.filter((item) => item.selected !== false).map((item) => ({
      source_item_id: item.id,
      product_name: item.title || "",
      product_link: item.url || "",
      product_image: item.img || "",
      variant: buildVariantSummary(item),
      quantity: item.quantity || 1,
      price_cny: parseFloat(item.price) || 0,
      note: item.note || "",
      seller: item.seller || "",
      size: item.size || "",
      color: item.color || "",
    })),
  };
}

async function createOrder() {
  if (cart.length === 0) {
    dependencies.showStatus("Giỏ hàng trống", "error");
    return;
  }
  if (!cart.some((item) => item.selected !== false)) {
    dependencies.showStatus("Vui lòng chọn ít nhất 1 sản phẩm để tạo đơn", "error");
    return;
  }
  try {
    dependencies.showStatus("Đang chuyển sang form tạo đơn hàng...", "info");
    const customerId = document.getElementById("customerSelect")?.value || "";
    const payload = buildDraftPayload(customerId);
    const url = dependencies.getSettings().frontendOrderUrl;
    const separator = url.includes("?") ? "&" : "?";
    await chrome.tabs.create({ url: `${url}${separator}payload=${encodeURIComponent(JSON.stringify(payload))}` });
    await dependencies.closeSidePanel();
  } catch (error) {
    console.error("Create external order failed:", error);
    dependencies.showStatus("Không thể mở form tạo đơn hàng", "error");
  }
}

async function selectAll(event) {
  cart.forEach((item) => { item.selected = event.target.checked; });
  await saveCart(cart);
  renderCart();
}

async function updateItem(event) {
  const index = parseInt(event.target.dataset.index, 10);
  const field = event.target.dataset.field;
  let value = event.target.value;
  if (field === "quantity") value = Math.max(parseInt(value, 10) || 1, 1);
  cart[index][field] = value;
  cart[index].selected = true;
  await saveCart(cart);
  renderCart();
}

function renderInput(label, field, value, index, type = "text", extra = "") {
  return `<div class="form-field"><label>${label}</label><input type="${type}" class="item-field" data-field="${field}" data-index="${index}" value="${escapeHtml(value)}" ${extra}></div>`;
}

function renderCart() {
  const container = document.getElementById("cartItems");
  const summary = document.getElementById("cartSummary");
  const empty = document.getElementById("emptyCart");
  if (cart.length === 0) {
    container.innerHTML = "";
    summary.style.display = "none";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  summary.style.display = "block";
  let totalAmount = 0;
  let totalItems = 0;
  container.innerHTML = cart.map((item, index) => {
    const selected = item.selected !== false;
    if (selected) {
      totalAmount += (parseFloat(item.price) || 0) * (item.quantity || 1);
      totalItems += item.quantity || 1;
    }
    const image = item.img ? `<img src="${escapeHtml(item.img)}" alt="${escapeHtml(item.title)}">` : "📦";
    return `<div class="cart-item">
      <div class="cart-item-checkbox"><input type="checkbox" class="item-checkbox" data-index="${index}" ${selected ? "checked" : ""}></div>
      <div class="cart-item-visual"><div class="cart-item-image">${image}</div><div class="cart-item-visual-btns">
        <button class="btn btn-secondary btn-upload">Upload</button><button class="btn btn-secondary btn-link" data-url="${escapeHtml(item.url)}">Link</button>
      </div></div>
      <div class="cart-item-form"><div class="form-row-top">
        ${renderInput("Kích cỡ*", "size", item.size || "N/A", index)}${renderInput("Màu*", "color", item.color || "N/A", index)}
        ${renderInput("Đơn vị*", "seller", item.seller, index)}${renderInput("Số lượng*", "quantity", item.quantity, index, "number", 'min="1"')}
        ${renderInput("Giá web*", "price", item.price, index)}</div>
        <div class="form-row"><div class="form-field full"><label>Tên sản phẩm*</label><input type="text" class="item-field" data-field="title" data-index="${index}" value="${escapeHtml(item.title)}"></div></div>
        <div class="form-row link-row"><div class="form-field full"><label>Link sản phẩm*</label><input type="text" class="item-field" data-field="url" data-index="${index}" value="${escapeHtml(item.url)}"></div><button class="btn-remove" data-index="${index}">✖</button></div>
        <div class="form-row"><div class="form-field full"><label>Ghi chú*</label><textarea class="item-field" data-field="note" data-index="${index}">${escapeHtml(item.note)}</textarea></div></div>
      </div></div>`;
  }).join("");
  document.getElementById("totalItems").textContent = totalItems;
  document.getElementById("totalAmount").textContent = totalAmount.toFixed(2);
  document.getElementById("selectAllProducts").checked = cart.every((item) => item.selected !== false);
  document.querySelectorAll(".item-checkbox").forEach((element) => element.addEventListener("change", async (event) => {
    cart[parseInt(event.target.dataset.index, 10)].selected = event.target.checked;
    await saveCart(cart);
    renderCart();
  }));
  document.querySelectorAll(".item-field").forEach((element) => element.addEventListener("change", updateItem));
  document.querySelectorAll(".btn-link").forEach((element) => element.addEventListener("click", (event) => {
    if (event.currentTarget.dataset.url) window.open(event.currentTarget.dataset.url, "_blank");
  }));
  document.querySelectorAll(".btn-upload").forEach((element) => element.addEventListener("click", () => alert("Chức năng Upload đang được xây dựng!")));
  document.querySelectorAll(".btn-remove").forEach((element) => element.addEventListener("click", () => removeFromCart(parseInt(element.dataset.index, 10))));
}
