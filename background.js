// Background service worker for managing extension state
console.log("Tmall Product Scraper - Background service worker initialized");

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed successfully");

    // Enable Side Panel to open on action click
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

    // Initialize default settings
    chrome.storage.local.set({
        cart: [],
        autoExtract: true,
        apiEndpoint: 'http://127.0.0.1:8000/graphql',
        token: null
    });
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'addToCart') {
        addToCart(request.data).then(result => {
            sendResponse({ success: true, data: result });
        }).catch(error => {
            sendResponse({ success: false, error: error.message });
        });
        return true; // Keep channel open for async response
    }

    if (request.action === 'getCart') {
        chrome.storage.local.get(['cart'], (result) => {
            sendResponse({ success: true, data: result.cart || [] });
        });
        return true;
    }

    if (request.action === 'clearCart') {
        chrome.storage.local.set({ cart: [] }, () => {
            sendResponse({ success: true });
        });
        return true;
    }

    if (request.action === 'removeFromCart') {
        removeFromCart(request.index).then(() => {
            sendResponse({ success: true });
        });
        return true;
    }

});

// Add product to cart
async function addToCart(productData) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['cart'], (result) => {
            const cart = result.cart || [];

            // Add timestamp and unique ID
            const cartItem = {
                ...productData,
                id: Date.now(),
                addedAt: new Date().toISOString()
            };

            cart.push(cartItem);

            chrome.storage.local.set({ cart }, () => {
                resolve(cartItem);
            });
        });
    });
}

// Remove item from cart
async function removeFromCart(index) {
    return new Promise((resolve) => {
        chrome.storage.local.get(['cart'], (result) => {
            const cart = result.cart || [];
            cart.splice(index, 1);
            chrome.storage.local.set({ cart }, () => {
                resolve();
            });
        });
    });
}

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
// open login
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "openLogin") {
        chrome.windows.create({
            url: chrome.runtime.getURL("login.html"),
            type: "popup",
            width: 400,
            height: 600
        });
    }
});
