import { initializeExtensionStorage } from "../storage/settings.js";
import {
    addCartItem,
    clearCart,
    getCart,
    removeCartItem,
} from "../storage/cart.js";
import { MESSAGE_TYPES } from "../shared/constants.js";

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
    // Enable Side Panel to open on action click
    void chrome.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.warn("Unable to configure side panel behavior:", error));

    // Initialize only missing values so updates do not erase user state.
    void initializeExtensionStorage();
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handlers = {
        [MESSAGE_TYPES.ADD_TO_CART]: () => addCartItem(request.data),
        [MESSAGE_TYPES.GET_CART]: () => getCart(),
        [MESSAGE_TYPES.CLEAR_CART]: () => clearCart(),
        [MESSAGE_TYPES.REMOVE_FROM_CART]: () => removeCartItem(request.index),
        [MESSAGE_TYPES.OPEN_LOGIN]: async () => {
            await chrome.windows.create({
                url: chrome.runtime.getURL("login/login.html"),
                type: "popup",
                width: 400,
                height: 600,
            });
        },
    };

    const handler = handlers[request.action];
    if (!handler) return false;

    handler()
        .then((data) => sendResponse({ success: true, data }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
});

// Badge update to show cart count
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.cart) {
        const cartCount = changes.cart.newValue?.length || 0;
        chrome.action.setBadgeText({
            text: cartCount > 0 ? cartCount.toString() : ''
        });
        chrome.action.setBadgeBackgroundColor({ color: '#FF5722' });
    }
});

const staffOriginAllowed = (origin) => (chrome.runtime.getManifest().externally_connectable?.matches || []).some((pattern) => {
    try {
        const allowed = new URL(pattern.replace(/\*$/, ""));
        const candidate = new URL(origin);
        return allowed.protocol === candidate.protocol && allowed.hostname === candidate.hostname;
    } catch { return false; }
});
const supportedProductUrl = (value) => {
    try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) && ["taobao.com", "tmall.com", "1688.com"].some((root) => url.hostname === root || url.hostname.endsWith(`.${root}`));
    } catch { return false; }
};
const waitForProductTab = (tabId) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(() => reject(new Error("PAGE_LOAD_TIMEOUT"))), 45000);
    const listener = (changedId, info) => { if (changedId === tabId && info.status === "complete") finish(resolve); };
    const finish = (callback) => { clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); callback(); };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => { if (tab.status === "complete") finish(resolve); }).catch(() => finish(() => reject(new Error("TAB_CLOSED"))));
});

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    let origin = "";
    try { origin = new URL(sender.url || sender.origin).origin; } catch {}
    if (!staffOriginAllowed(origin) || request?.type !== "STAFF_PRODUCT_EXTRACT" || request.protocol_version !== "1.0" || !supportedProductUrl(request.product_url)) {
        sendResponse({ ok: false, error: { code: "INVALID_EXTERNAL_REQUEST" } });
        return false;
    }
    (async () => {
        const tab = await chrome.tabs.create({ url: request.product_url, active: false });
        try {
            await waitForProductTab(tab.id);
            let response;
            try { response = await chrome.tabs.sendMessage(tab.id, { action: MESSAGE_TYPES.EXTRACT_PRODUCT }); }
            catch {
                await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["shared/sku-extractor.js", "shared/product-contract.js", "content/scraper.js", "content/content.js"] });
                response = await chrome.tabs.sendMessage(tab.id, { action: MESSAGE_TYPES.EXTRACT_PRODUCT });
            }
            sendResponse(response?.success ? { ok: true, product: response.data } : { ok: false, error: { code: "EXTRACTION_FAILED" }, tab_id: tab.id });
            if (response?.success && response.data?.extraction_status !== "unavailable") await chrome.tabs.remove(tab.id).catch(() => {});
        } catch (error) { sendResponse({ ok: false, error: { code: error.message }, tab_id: tab.id }); }
    })();
    return true;
});
