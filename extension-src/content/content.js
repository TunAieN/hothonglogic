// Content-script entrypoint. Keep this file classic (non-module) for Manifest V3.
(() => {
    const scraper = globalThis.HothonglogicProductScraper;

    if (!scraper) {
        throw new Error('Product scraper module was not loaded.');
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'extractProduct') {
            scraper.extractProductInfoAsync()
                .then((data) => sendResponse({ success: true, data }))
                .catch((error) => sendResponse({ success: false, error: error.message }));
            return true;
        }
        return false;
    });

    chrome.storage.local.get(['autoExtract'], (result) => {
        if (result.autoExtract !== false) {
            void scraper.extractProductInfoAsync().then((productData) => {
                if (productData.title) chrome.storage.local.set({ currentProduct: productData });
            });
        }
    });
})();
