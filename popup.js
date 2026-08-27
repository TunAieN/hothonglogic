import { fetchCustomers } from "./extension-src/api/customers.js";
import { clearAuthSession, getAuthSession } from "./extension-src/auth/auth.js";
import { MESSAGE_TYPES, STORAGE_KEYS } from "./extension-src/shared/constants.js";
import { loadExtensionSettings, saveExtensionSettings } from "./extension-src/storage/settings.js";
import { initializeCart } from "./extension-src/popup/cart.js";
import { getCurrentProduct, loadCurrentProduct } from "./extension-src/popup/product.js";
import { closeSidePanel, setupTabs, showStatus } from "./extension-src/popup/ui.js";

let settings = {};
const getSettings = () => settings;

async function loadSettings() {
  settings = await loadExtensionSettings();
  document.getElementById("apiEndpoint").value = settings.apiEndpoint;
  document.getElementById("autoExtract").checked = settings.autoExtract;
  document.getElementById("frontendOrderUrl").value = settings.frontendOrderUrl;
}

async function saveSettings() {
  try {
    settings = await saveExtensionSettings({
      apiEndpoint: document.getElementById("apiEndpoint").value.trim(),
      autoExtract: document.getElementById("autoExtract").checked,
      frontendOrderUrl: document.getElementById("frontendOrderUrl").value.trim(),
    });
    showStatus("Đã lưu cài đặt", "success");
  } catch (error) {
    console.error("Save settings failed:", error);
    showStatus("Lỗi khi lưu cài đặt", "error");
  }
}

async function loadCustomers() {
  const select = document.getElementById("customerSelect");
  select.disabled = true;
  select.innerHTML = '<option value="">-- Đang tải khách hàng --</option>';
  if (!settings.token) {
    select.innerHTML = '<option value="">-- Đăng nhập để tải khách hàng --</option>';
    return;
  }
  try {
    const customers = await fetchCustomers({ endpoint: settings.apiEndpoint, token: settings.token });
    select.innerHTML = '<option value="">-- Chọn khách hàng --</option>';
    customers.forEach((customer) => {
      const option = document.createElement("option");
      option.value = customer.id;
      option.textContent = `${customer.code} - ${customer.name} (${customer.phone})`;
      select.appendChild(option);
    });
    select.disabled = false;
  } catch (error) {
    console.error("Load customers failed:", error);
    select.innerHTML = '<option value="">-- Không thể tải khách hàng --</option>';
  }
}

async function updateAuthUI() {
  const session = await getAuthSession();
  document.getElementById("authBtn").textContent = session.token
    ? `👤 ${session.user?.name || "Tài khoản"}`
    : "🔐 Đăng nhập";
}

function setupAuth() {
  const menu = document.getElementById("dropdownMenu");
  document.getElementById("authBtn").addEventListener("click", async () => {
    const session = await getAuthSession();
    if (session.token) {
      menu.style.display = menu.style.display === "block" ? "none" : "block";
    } else {
      await chrome.runtime.sendMessage({ action: MESSAGE_TYPES.OPEN_LOGIN });
    }
  });
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    if (!confirm("Bạn có chắc chắn muốn đăng xuất?")) return;
    await clearAuthSession();
    settings.token = null;
    menu.style.display = "none";
    await updateAuthUI();
  });
}

async function openExternalOrderForm() {
  try {
    await chrome.tabs.create({ url: settings.frontendOrderUrl });
    await closeSidePanel();
  } catch (error) {
    console.error("Open external order form failed:", error);
    showStatus("Không thể mở form tạo đơn hàng", "error");
  }
}

function setupListeners() {
  document.getElementById("refreshBtn")?.addEventListener("click", loadCurrentProduct);
  document.getElementById("saveSettingsBtn")?.addEventListener("click", saveSettings);
  document.getElementById("openExternalOrderFormBtn")?.addEventListener("click", openExternalOrderForm);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.active) void loadCurrentProduct();
  });
  chrome.tabs.onActivated.addListener(() => void loadCurrentProduct());
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEYS.TOKEN]) {
      settings.token = changes[STORAGE_KEYS.TOKEN].newValue || null;
      void updateAuthUI();
      void loadCustomers();
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  setupTabs();
  setupAuth();
  setupListeners();
  await initializeCart({ getCurrentProduct, getSettings, showStatus, closeSidePanel });
  await updateAuthUI();
  await loadCustomers();
  await loadCurrentProduct();
});
