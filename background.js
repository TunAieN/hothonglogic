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

    if (request.action === 'submitOrder') {
        submitOrderToBackend(request.data).then(result => {
            sendResponse({ success: true, data: result });
        }).catch(error => {
            sendResponse({ success: false, error: error.message });
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

// Submit order to backend API
// Submit order to backend API
async function submitOrderToBackend(orderData) {
    try {
        const settings = await chrome.storage.local.get(['apiEndpoint', 'token']);
        let apiEndpoint = settings.apiEndpoint || 'http://127.0.0.1:8000/graphql';
        let token = settings.token;
        if (!token) {
            throw new Error('No authentication token found. Please login first.');
        }
        const query = `
            mutation ($input: CreateOrderInput!) {
                createOrder(input: $input) {
                    id
                    total_amount
                }
            }
        `;

        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                query,
                variables: {
                    input: orderData
                }
            })
        });

        const result = await response.json();

        if (result.errors) {
            throw new Error(result.errors[0].message);
        }

        return result.data;
    } catch (error) {
        throw error;
    }
}
// async function submitOrderToBackend(orderData) {
//     return new Promise(async (resolve, reject) => {
//         try {
//             const settings = await chrome.storage.local.get(['apiEndpoint']);
//             let apiEndpoint = settings.apiEndpoint || 'http://127.0.0.1:8000/graphql';

//             // Remove trailing slash
//             if (apiEndpoint.endsWith('/')) {
//                 apiEndpoint = apiEndpoint.slice(0, -1);
//             }

//             let url;
//             // Check if using standalone PHP files (e.g., http://localhost/extension/api)
//             if (apiEndpoint.includes('.php') || !apiEndpoint.includes(':8000')) {
//                 url = `${apiEndpoint}/orders.php`;
//             } else {
//                 // Laravel API
//                 url = `${apiEndpoint}/orders`;
//             }

//             console.log('Submitting order to:', url);

//             const response = await fetch(url, {
//                 method: 'POST',
//                 headers: {
//                     'Content-Type': 'application/json',
//                     // Add authentication token here when implemented
//                     // 'Authorization': `Bearer ${token}`
//                 },
//                 body: JSON.stringify(orderData)
//             });

//             if (!response.ok) {
//                 throw new Error(`API error: ${response.status}`);
//             }

//             const result = await response.json();
//             resolve(result);
//         } catch (error) {
//             reject(error);
//         }
//     });
// }

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
