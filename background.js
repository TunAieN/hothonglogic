import { initializeExtensionStorage } from "./extension-src/storage/settings.js";
import {
    addCartItem,
    clearCart,
    getCart,
    removeCartItem,
} from "./extension-src/storage/cart.js";
import { MESSAGE_TYPES } from "./extension-src/shared/constants.js";

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
    // Enable Side Panel to open on action click
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

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
                url: chrome.runtime.getURL("login.html"),
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
