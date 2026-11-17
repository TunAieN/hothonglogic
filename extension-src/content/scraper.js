// Classic content-script module. It exposes one focused scraper API because
// Manifest V3 content scripts are not loaded as ES modules.
(() => {

// Helper function to extract element using XPath
function getElementByXPath(xpath) {
    const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
    );
    return result.singleNodeValue;
}
function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
}

function extractSkuOption(labelMatcher) {
    const groups = document.querySelectorAll('#skuOptionsArea > div');

    for (const group of groups) {

        const labelEl = group.querySelector('[class*="ItemLabel"] span');
        if (!labelEl) continue;

        const label = normalizeText(labelEl.textContent);

        if (labelMatcher(label)) {
            const selectedSelectors = [
                '[class*="isSelected"] [class*="valueItemText"]',
                '[class*="isSelected"] span',
                '[class*="isSelected"]'
            ];

            for (const selector of selectedSelectors) {
                const selected = group.querySelector(selector);
                const text = normalizeText(selected?.textContent);
                if (text) return text;
            }

            const fallbackSelectors = [
                '[class*="valueItem"] [class*="valueItemText"]',
                '[class*="valueItem"] span',
                '[class*="valueItem"]'
            ];
            for (const selector of fallbackSelectors) {
                const first = group.querySelector(selector);
                const text = normalizeText(first?.textContent);
                if (text) return text;
            }
        }
    }

    return null;
}

function matchesSizeLabel(label) {
    return /(\bsize\b|\bcm\b|\beu\b|\bus\b|\buk\b|\bjp\b|\u5c3a\u7801|\u5c3a\u5bf8|\u5927\u5c0f|\u978b\u7801)/i.test(label);
}

function matchesColorLabel(label) {
    return /(\bcolor\b|\bcolour\b|\u989c\u8272|\u989c\u8272\u5206\u7c7b|\u5546\u54c1\u89c4\u683c)/i.test(label);
}

function extractSellerInfo() {
    const sellerSelectors = [
        '#left-content-area a[href*="shop"] [class*="shopName"]',
        '#left-content-area [class*="shopHeader"] [class*="shopName"]',
        'a[href*="shop"] [class*="shopName"]',
        '[class*="shopNameWrap"]',
        '[class*="ShopHeader"] [class*="shopName"]'
    ];

    for (const selector of sellerSelectors) {
        const element = document.querySelector(selector);
        const text = normalizeText(element?.textContent);
        if (!text) continue;

        const link = element.closest('a[href]');
        return {
            seller: text,
            sellerUrl: link?.href || ''
        };
    }

    return {
        seller: '',
        sellerUrl: ''
    };
}

function firstText(selectors) {
    for (const selector of selectors) {
        try {
            const value = normalizeText(document.querySelector(selector)?.textContent);
            if (value) return value;
        } catch {}
    }
    return '';
}

function metaContent(...names) {
    for (const name of names) {
        const value = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content;
        if (value) return value.trim();
    }
    return '';
}

function enrichFromStructuredData(productData) {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
            const parsed = JSON.parse(script.textContent);
            const nodes = Array.isArray(parsed) ? parsed : [parsed, ...(parsed?.['@graph'] || [])];
            const product = nodes.find((node) => node?.['@type'] === 'Product');
            if (!product) continue;
            productData.title ||= normalizeText(product.name);
            const structuredImages = Array.isArray(product.image) ? product.image : [product.image];
            productData.images.push(...structuredImages.filter(Boolean));
            productData.img ||= structuredImages.find(Boolean);
            const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers;
            productData.price ||= offers?.price || offers?.lowPrice;
            productData.min_price_cny ||= offers?.lowPrice;
            productData.max_price_cny ||= offers?.highPrice;
            for (const variant of product.hasVariant || []) {
                const variantOffer = Array.isArray(variant?.offers) ? variant.offers[0] : variant?.offers;
                productData.skus.push({
                    sku_id: variant.sku || variant.productID || '',
                    label: normalizeText(variant.name),
                    color: normalizeText(variant.color) || null,
                    size: normalizeText(variant.size) || null,
                    price_cny: variantOffer?.price ?? null,
                    image: Array.isArray(variant.image) ? variant.image[0] : variant.image,
                    availability: typeof variantOffer?.availability === 'string' ? !/OutOfStock|SoldOut/i.test(variantOffer.availability) : null
                });
            }
        } catch {}
    }
}

function waitForStableProduct(timeoutMs = 8000) {
    return new Promise((resolve) => {
        const started = Date.now();
        let stableTimer;
        const ready = () => Boolean(document.querySelector('h1, [class*="mainTitle"], [class*="ItemTitle"], meta[property="og:title"]'));
        const finish = () => {
            clearTimeout(stableTimer);
            clearTimeout(timeoutTimer);
            observer.disconnect();
            resolve();
        };
        const schedule = () => {
            clearTimeout(stableTimer);
            if (ready()) stableTimer = setTimeout(finish, Math.max(900, 1800 - (Date.now() - started)));
            if (Date.now() - started >= timeoutMs) finish();
        };
        const observer = new MutationObserver(schedule);
        const timeoutTimer = setTimeout(finish, timeoutMs);
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
        schedule();
    });
}
// Function to extract product information
function extractProductInfo() {
    const productData = {
        url: window.location.href,
        selected_sku_id: new URL(window.location.href).searchParams.get('skuId'),
        timestamp: new Date().toISOString()
    };

    // Extract product title - Try XPath first, then CSS selectors
    const titleXPaths = [
        '//span[contains(@class,"mainTitle")]',
        '//div[contains(@class,"MainTitle")]//span',
        '//div[contains(@class,"ItemTitle")]//span'

    ];

    // Try XPath selectors first
    for (const xpath of titleXPaths) {
        const element = getElementByXPath(xpath);
        if (element && element.textContent) {
            productData.title = element.textContent.trim();
            if (productData.title) break;
        }
    }

    // Fallback to CSS selectors if XPath didn't work
    if (!productData.title) {
        const titleSelectors = [
            '[class*="mainTitle"]',
            '[class*="MainTitle"] span',
            '[class*="ItemTitle"] span'

        ];

        for (const selector of titleSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                productData.title = element.textContent.trim();
                if (productData.title) break;
            }
        }
    }

    productData.title ||= metaContent('og:title', 'twitter:title') || firstText([
        'h1', '[class*="title"] h1', '[class*="titleText"]', '[class*="Title"]'
    ]);

    // Extract price - Try XPath first (more reliable for Taobao), then CSS selectors
    const priceXPaths = [
        '//*[@id="tbpcDetail_SkuPanelBody"]/div[2]/div[1]/div/div[1]/div[1]/div/span[3]', // Khi có cả 2 giá: giá hiện tại ở div[1]
        '//*[@id="tbpcDetail_SkuPanelBody"]/div[2]/div[1]/div/div[1]/div[2]/div/span[3]', // Khi chỉ có 1 giá: nằm ở div[2]
    ];

    // Try XPath selectors first
    for (const xpath of priceXPaths) {
        const element = getElementByXPath(xpath);
        if (element && element.textContent) {
            productData.price = element.textContent.trim().replace(/[^0-9.]/g, '');
            if (productData.price) break;
        }
    }

    // Fallback to CSS selectors if XPath didn't work
    if (!productData.price) {
        const priceSelectors = [
            '#tbpcDetail_SkuPanelBody > div.block2--MLcO9YdF > div > div > div > div > span.text--LP7Wf49z',
            '#tbpcDetail_SkuPanelBody span[class*="text"]'
        ];

        for (const selector of priceSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                productData.price = element.textContent.trim().replace(/[^0-9.]/g, '');
                if (productData.price) break;
            }
        }
    }

    productData.price ||= metaContent('product:price:amount', 'og:price:amount') || firstText([
        '[class*="price"] [class*="value"]', '[class*="Price"]', '.price', '[data-price]'
    ]).replace(/[^0-9.~-]/g, '');

    // Extract Original Price (Giá gốc)
    // Priority 1: User provided XPath and Selectors
    const originalPriceXPaths = [
        '//*[@id="tbpcDetail_SkuPanelBody"]/div[2]/div[1]/div/div[1]/div[2]/div/span[3]'
    ];

    for (const xpath of originalPriceXPaths) {
        const element = getElementByXPath(xpath);
        if (element && element.textContent) {
            const p = element.textContent.trim().replace(/[^0-9.]/g, '');
            if (p) {
                productData.originalPrice = p;
                break;
            }
        }
    }

    if (!productData.originalPrice) {
        const originalPriceSelectors = [
            '#tbpcDetail_SkuPanelBody > div.block2--MLcO9YdF > div:nth-child(1) > div > div.leftWrap--IJTfJ3mp > div.summaryWrap--CttBB0oR > div > span:nth-child(3)',
            '.tm-price', // Common Tmall original price
            'dt:contains("价格") + dd .tm-price',
            '.tb-rmb-num', // Taobao original price often in a <del> tag
            'del .class',
            'dl.tm-price-panel dd .tm-price',
            '#J_StrPriceMod .tm-price'
        ];

        for (const selector of originalPriceSelectors) {
            try {
                const element = document.querySelector(selector);
                if (element && element.textContent) {
                    const p = element.textContent.trim().replace(/[^0-9.]/g, '');
                    if (p) {
                        productData.originalPrice = p;
                        break;
                    }
                }
            } catch {}
        }
    }

    // Extract size information if available
    productData.size = extractSkuOption(matchesSizeLabel);

    // Extract quantity information if available
    const quantitySelectors = [
        '#tbpcDetail_SkuPanelBody > div.body--FO6TDxA0 > div > div.root--uHUOEAcH > div.content--mUAk6rrf > div.countWrapper--EEYLrWjn > div.countValueWrapper--NsSDP4ir > input'
    ];
    for (const selector of quantitySelectors) {
        const element = document.querySelector(selector);
        if (element) {
            productData.quantity = element.value.trim();
            break;
        }
    }
    // Extract color information if available
    productData.color = extractSkuOption(matchesColorLabel);

    // Extract img - Try XPath first (more reliable for Taobao), then CSS selectors
    const imgXPaths = [
        '//*[@id="mainPicImageEl"]', // User-verified working XPath
        '//img[contains(@class, "mainPic")]',
    ];

    // Try XPath selectors first
    for (const xpath of imgXPaths) {
        const element = getElementByXPath(xpath);
        if (element && element.src) {
            productData.img = element.src;
            if (productData.img) break;
        }
    }

    // Fallback to CSS selectors if XPath didn't work
    if (!productData.img) {
        const imgSelectors = [
            '#mainPicImageEl',
        ];

        for (const selector of imgSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                productData.img = element.src;
                if (productData.img) break;
            }
        }
    }

    productData.img ||= metaContent('og:image', 'twitter:image');

    // Extract all product images
    const imageGallerySelectors = [
        '#J_UlThumb img',
        '.tb-thumb img',
        '[class*="thumbnails"] img'
    ];

    productData.images = [];
    for (const selector of imageGallerySelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            elements.forEach(img => {
                const src = img.src || img.getAttribute('data-src');
                if (src && !productData.images.includes(src)) {
                    productData.images.push(src);
                }
            });
            break;
        }
    }

    document.querySelectorAll('[class*="gallery"] img, [class*="thumb"] img, [class*="Image"] img').forEach((image) => {
        const src = image.currentSrc || image.src || image.getAttribute('data-src');
        if (src) productData.images.push(src);
    });

    // Extract seller information
    const sellerInfo = extractSellerInfo();
    if (sellerInfo.seller) {
        productData.seller = sellerInfo.seller;
    }
    if (sellerInfo.sellerUrl) {
        productData.sellerUrl = sellerInfo.sellerUrl;
    }

    // Extract SKU information
    const skuElements = document.querySelectorAll('[data-sku-id], [data-sku_id]');
    productData.skus = [];
    skuElements.forEach(sku => {
        const skuText = normalizeText(sku.textContent || sku.getAttribute('title'));
        if (skuText) {
            productData.skus.push({
                sku_id: sku.dataset.skuId || sku.getAttribute('data-sku_id') || '',
                label: skuText,
                image: sku.querySelector('img')?.src || sku.style?.backgroundImage?.match(/url\(["']?(.*?)["']?\)/)?.[1] || null,
                availability: !sku.matches('[disabled], [class*="disabled"], [class*="soldOut"]')
            });
        }
    });

    productData.minimum_quantity = firstText(['[class*="minOrder"]', '[class*="beginAmount"]', '[class*="minimum"]']);
    enrichFromStructuredData(productData);
    const sharedSkuExtractor = globalThis.VietTrungSkuExtractor;
    if (sharedSkuExtractor) {
        const skuData = sharedSkuExtractor.extract(document, window.location.href);
        productData.attribute_groups = skuData.attribute_groups;
        productData.quantity_price_tiers = skuData.quantity_price_tiers;
        productData.has_variants = skuData.has_variants;
        productData.sku_extraction_complete = skuData.sku_extraction_complete;
        if (skuData.skus.length) productData.skus = skuData.skus;
        else if (productData.skus.length) {
            productData.has_variants = true;
            productData.sku_extraction_complete = false;
        }
    }

    // Extract shipping fee if available
    const shippingSelectors = [
        '[class*="Delivery"]',
        '.tb-shipping'
    ];

    for (const selector of shippingSelectors) {
        const element = document.querySelector(selector);
        if (element) {
            const shippingText = element.textContent;
            const shippingMatch = shippingText.match(/[\d.]+/);
            if (shippingMatch) {
                productData.shippingFee = shippingMatch[0];
            }
            break;
        }
    }

    const contract = globalThis.VietTrungProductContract;
    return contract ? contract.normalizeProduct(productData, { url: window.location.href, source: 'extension_dom' }) : productData;
}

async function extractProductInfoAsync() {
    await waitForStableProduct();
    return extractProductInfo();
}

globalThis.HothonglogicProductScraper = Object.freeze({ extractProductInfo, extractProductInfoAsync });
})();
