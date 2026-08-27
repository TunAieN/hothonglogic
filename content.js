// Content-script entrypoint. Keep this file classic (non-module) for Manifest V3.
(() => {
    const scraper = globalThis.HothonglogicProductScraper;

    if (!scraper) {
        throw new Error('Product scraper module was not loaded.');
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'extractProduct') {
            sendResponse({ success: true, data: scraper.extractProductInfo() });
        }
    });

    chrome.storage.local.get(['autoExtract'], (result) => {
        if (result.autoExtract !== false) {
            const productData = scraper.extractProductInfo();
            if (productData.title) {
                chrome.storage.local.set({ currentProduct: productData });
            }
        }
    });
})();
