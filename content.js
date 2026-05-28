// Content script for extracting product information from Tmall/Taobao
console.log("Tmall Product Scraper - Content script loaded");

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
// Function to extract product information
function extractProductInfo() {
    const productData = {
        url: window.location.href,
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
            console.log("Product title:", productData.title);
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
            } catch (e) {
                console.log("Error querying selector", selector);
            }
        }
    }
    console.log("Original Price:", productData.originalPrice);

    // Extract size information if available
    productData.size = extractSkuOption(matchesSizeLabel);
    console.log("Size:", productData.size);
    // const sizeSelectors = [
    //    '#skuOptionsArea > div > div.skuValueWrap--aEfxuhNr > div > div > div:nth-child(1) > span.valueItemText--T7YrR8tO.f-els-1',
    //    '#skuOptionsArea > div:nth-child(1) > div.skuValueWrap--aEfxuhNr > div > div > div.valueItem--smR4pNt4.isSelected--_a9zOp7C > span'
    // ];
    // for (const selector of sizeSelectors) {
    //     const element = document.querySelector(selector);
    //     if (element) {
    //         productData.size = element.textContent.trim();
    //         break;
    //     }
    // }
    // console.log("Size:", productData.size);

    //    const sizeXPaths = [
    //         '//*[@id="skuOptionsArea"]/div/div[2]/div/div/div[1]/span[1]', // User-verified working XPath for size
    //     ];
    //     if (!productData.size) {
    //         for (const xpath of sizeXPaths) {
    //         const element = getElementByXPath(xpath);
    //         if (element) {
    //             productData.size = element.textContent.trim();
    //             break;
    //         }
    //         }
    //     }
    //     console.log("Size:", productData.size);
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
    console.log("Quantity:", productData.quantity);

    // Extract color information if available
    productData.color = extractSkuOption(matchesColorLabel);
    console.log("Color:", productData.color);
    // const colorSelectors = [
    //     '#skuOptionsArea > div:nth-child(2) > div.skuValueWrap--aEfxuhNr > div > div > div.valueItem--smR4pNt4.isSelected--_a9zOp7C.hasImg--K82HLg1O > span.valueItemText--T7YrR8tO.f-els-1',
    //     '#skuOptionsArea > div:nth-child(2) > div.skuValueWrap--aEfxuhNr > div > div > div.valueItem--smR4pNt4.isSelected--_a9zOp7C.hasImg--K82HLg1O > span',
    //     '#skuOptionsArea > div > div.skuValueWrap--aEfxuhNr > div > div > div > span.valueItemText--T7YrR8tO.f-els-1'
    // ];      
    // for (const selector of colorSelectors) {
    //     const element = document.querySelector(selector);
    //     if (element) {
    //         productData.color = element.textContent.trim();
    //         break;
    //     }
    // }
    // console.log("Color:", productData.color);
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

    console.log("Product image:", productData.img);


    // // Extract main product image
    // const imageSelectors = [
    //     '#J_ImgBooth',
    //     '.tb-booth-seller img',
    //     '[class*="MainPic"] img',
    //     '.tb-pic img'
    // ];

    // for (const selector of imageSelectors) {
    //     const element = document.querySelector(selector);
    //     if (element) {
    //         productData.image = element.src || element.getAttribute('data-src');
    //         break;
    //     }
    // }

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

    // Extract seller information
    const sellerInfo = extractSellerInfo();
    if (sellerInfo.seller) {
        productData.seller = sellerInfo.seller;
    }
    if (sellerInfo.sellerUrl) {
        productData.sellerUrl = sellerInfo.sellerUrl;
    }

    // Extract SKU information
    const skuElements = document.querySelectorAll('[class*="SkuItem"], .tb-sku li');
    productData.skus = [];
    skuElements.forEach(sku => {
        const skuText = sku.textContent.trim();
        if (skuText) {
            productData.skus.push(skuText);
        }
    });

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

    return productData;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractProduct') {
        const productData = extractProductInfo();
        sendResponse({ success: true, data: productData });
    }
    return true;
});

// Store product data when page loads
chrome.storage.local.get(['autoExtract'], (result) => {
    if (result.autoExtract !== false) {
        const productData = extractProductInfo();
        if (productData.title) {
            chrome.storage.local.set({ currentProduct: productData });
        }
    }
});
