import { ALLOWED_WEBSITE_ORIGINS } from "../config/allowed-origins.js";

const PROTOCOL_VERSION = "1.0";
const REQUEST_KEY = "productExtractionRequests";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ACTIVE_REQUESTS = 2;
const TYPES = Object.freeze({
  PING: "PRODUCT_EXTRACT_PING",
  REQUEST: "PRODUCT_EXTRACT_REQUEST",
  STATUS: "PRODUCT_EXTRACT_STATUS",
  CANCEL: "PRODUCT_EXTRACT_CANCEL",
});

const originOf = (sender) => {
  try { return new URL(sender.url || sender.origin).origin; } catch { return ""; }
};
const allowedSender = (sender) => ALLOWED_WEBSITE_ORIGINS.includes(originOf(sender));
const requestIdValid = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value);
const supportedUrl = (value) => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return ["taobao.com", "tmall.com", "1688.com"].some((root) => host === root || host.endsWith(`.${root}`)) && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
};
const readRequests = async () => (await chrome.storage.session.get(REQUEST_KEY))[REQUEST_KEY] || {};
const writeRequests = (requests) => chrome.storage.session.set({ [REQUEST_KEY]: requests });
const updateRequest = async (requestId, patch) => {
  const requests = await readRequests();
  if (!requests[requestId]) return null;
  requests[requestId] = { ...requests[requestId], ...patch, updated_at: Date.now() };
  await writeRequests(requests);
  return requests[requestId];
};
const publicStatus = (request) => request ? ({
  request_id: request.request_id,
  protocol_version: PROTOCOL_VERSION,
  status: request.status,
  result: request.result || null,
  error: request.error || null,
  requires_user_action: request.requires_user_action || null,
  tab_id: request.requires_user_action ? request.tab_id : null,
}) : null;

async function findExistingTab(productUrl) {
  const target = new URL(productUrl);
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => {
    try {
      const current = new URL(tab.url);
      return current.hostname === target.hostname && current.pathname === target.pathname && current.searchParams.get("id") === target.searchParams.get("id");
    } catch { return false; }
  });
}

async function extract(requestId) {
  const requests = await readRequests();
  const request = requests[requestId];
  if (!request || request.status !== "queued") return;
  let tab = await findExistingTab(request.product_url);
  const createdTab = !tab;
  try {
    if (!tab) tab = await chrome.tabs.create({ url: request.product_url, active: false });
    await updateRequest(requestId, { status: "loading", tab_id: tab.id, created_tab: createdTab });
    await waitForTab(tab.id, requestId);
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { action: "extractProduct", requestId });
    } catch {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["shared/sku-extractor.js", "shared/product-contract.js", "content/scraper.js", "content/content.js"] });
      response = await chrome.tabs.sendMessage(tab.id, { action: "extractProduct", requestId });
    }
    if (!response?.success || !response.data) throw new Error("EXTRACTION_UNAVAILABLE");
    response.data.request_id = requestId;
    const final = await updateRequest(requestId, { status: response.data.extraction_status === "unavailable" ? "needs_user_action" : "completed", result: response.data, requires_user_action: response.data.extraction_status === "unavailable" ? "open_product_tab" : null });
    if (createdTab && final?.status === "completed") await chrome.tabs.remove(tab.id).catch(() => {});
  } catch (error) {
    const current = (await readRequests())[requestId];
    if (current?.status === "cancelled") return;
    await updateRequest(requestId, { status: "needs_user_action", error: { code: error.message || "EXTRACTION_FAILED", message: "Trang yêu cầu đăng nhập, xác minh hoặc chưa tải đủ dữ liệu." }, requires_user_action: "open_product_tab" });
  }
}

function waitForTab(tabId, requestId) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const listener = (changedId, changeInfo) => {
      if (changedId === tabId && changeInfo.status === "complete") finish(resolve);
    };
    const timer = setInterval(async () => {
      const request = (await readRequests())[requestId];
      if (!request || request.status === "cancelled") finish(() => reject(new Error("REQUEST_CANCELLED")));
      else if (Date.now() - started > REQUEST_TIMEOUT_MS) finish(() => reject(new Error("PAGE_LOAD_TIMEOUT")));
    }, 750);
    const finish = (callback) => { clearInterval(timer); chrome.tabs.onUpdated.removeListener(listener); callback(); };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => { if (tab.status === "complete") finish(resolve); }).catch(() => finish(() => reject(new Error("TAB_CLOSED"))));
  });
}

async function handle(message, sender) {
  if (!allowedSender(sender)) return { ok: false, error: { code: "ORIGIN_NOT_ALLOWED" } };
  if (message?.protocol_version !== PROTOCOL_VERSION) return { ok: false, error: { code: "PROTOCOL_MISMATCH" } };
  if (message.type === TYPES.PING) return { ok: true, protocol_version: PROTOCOL_VERSION, capabilities: ["Taobao", "Tmall", "1688"] };
  if (!requestIdValid(message.request_id)) return { ok: false, error: { code: "INVALID_REQUEST_ID" } };
  const requests = await readRequests();
  if (message.type === TYPES.STATUS) return { ok: true, request: publicStatus(requests[message.request_id]) };
  if (message.type === TYPES.CANCEL) {
    const request = requests[message.request_id];
    if (request && !["completed", "cancelled"].includes(request.status)) await updateRequest(message.request_id, { status: "cancelled" });
    return { ok: true };
  }
  if (message.type !== TYPES.REQUEST || !supportedUrl(message.product_url)) return { ok: false, error: { code: "INVALID_PRODUCT_URL" } };
  if (requests[message.request_id]) return { ok: true, accepted: true, request: publicStatus(requests[message.request_id]) };
  const active = Object.values(requests).filter((entry) => ["queued", "loading"].includes(entry.status));
  if (active.length >= MAX_ACTIVE_REQUESTS) return { ok: false, error: { code: "TOO_MANY_REQUESTS" } };
  requests[message.request_id] = { request_id: message.request_id, product_url: message.product_url, platform: message.platform, status: "queued", created_at: Date.now(), updated_at: Date.now() };
  await writeRequests(requests);
  void extract(message.request_id);
  return { ok: true, accepted: true, request: publicStatus(requests[message.request_id]) };
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  handle(message, sender).then(sendResponse).catch(() => sendResponse({ ok: false, error: { code: "INTERNAL_ERROR" } }));
  return true;
});

chrome.alarms.create("cleanup-product-requests", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(async ({ name }) => {
  if (name !== "cleanup-product-requests") return;
  const requests = await readRequests();
  const cutoff = Date.now() - 15 * 60_000;
  for (const [id, request] of Object.entries(requests)) {
    if (request.updated_at < cutoff) delete requests[id];
    else if (["queued", "loading"].includes(request.status) && Date.now() - request.created_at > REQUEST_TIMEOUT_MS) requests[id] = { ...request, status: "needs_user_action", requires_user_action: "open_product_tab" };
  }
  await writeRequests(requests);
});

async function recoverInterruptedRequests() {
  const requests = await readRequests();
  for (const request of Object.values(requests)) {
    if (!["queued", "loading"].includes(request.status)) continue;
    if (Date.now() - request.created_at > REQUEST_TIMEOUT_MS) {
      await updateRequest(request.request_id, { status: "needs_user_action", requires_user_action: "open_product_tab" });
    } else {
      await updateRequest(request.request_id, { status: "queued" });
      void extract(request.request_id);
    }
  }
}

void recoverInterruptedRequests();

chrome.runtime.onInstalled.addListener(() => chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }));
