import { MESSAGE_TYPES, SUPPORTED_PRODUCT_HOSTS } from "../shared/constants.js";

let currentProduct = null;
export const getCurrentProduct = () => currentProduct;

function setLoading(show) {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = show ? "flex" : "none";
}

function showEmptyProduct(message) {
  currentProduct = null;
  document.getElementById("productTitle").textContent = message || "Mời bạn mở trang sản phẩm Tmall hoặc Taobao!";
  document.getElementById("productPrice").textContent = "–";
  document.getElementById("productSeller").textContent = "–";
  document.getElementById("productSizeValue").textContent = "–";
  document.getElementById("productColorValue").textContent = "–";
  document.getElementById("productLink").value = "";
  document.getElementById("quantity").value = 1;
  document.getElementById("note").value = "";
  document.getElementById("productImage").style.display = "none";
  document.getElementById("original-price-info").style.display = "none";
  document.getElementById("productSize").style.display = "none";
  document.getElementById("productColor").style.display = "none";
  const button = document.getElementById("addToCartBtn");
  button.disabled = true;
  button.style.opacity = "0.5";
}

async function translateChineseToVietnamese(text) {
  if (!text || !/[\u4e00-\u9fa5]/.test(text)) return text;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const data = await response.json();
    return data[0].map((item) => item[0]).join("") || text;
  } catch (error) {
    console.error("Product translation failed:", error);
    return text;
  }
}

async function displayProduct(product) {
  const button = document.getElementById("addToCartBtn");
  button.disabled = false;
  button.style.opacity = "1";
  document.getElementById("productTitle").textContent = product.title || "N/A";
  document.getElementById("productPrice").textContent = product.price || "0";
  document.getElementById("quantity").value = product.quantity || "1";
  document.getElementById("productSeller").textContent = product.seller || "N/A";
  document.getElementById("productSizeValue").textContent = (await translateChineseToVietnamese(product.size)) || "N/A";
  document.getElementById("productColorValue").textContent = (await translateChineseToVietnamese(product.color)) || "N/A";
  document.getElementById("productLink").value = product.url || "";

  const image = document.getElementById("productImage");
  image.style.display = product.img ? "block" : "none";
  if (product.img) image.src = product.img;
  const hasOriginal = product.originalPrice && product.originalPrice !== product.price;
  document.getElementById("productOriginalPrice").textContent = hasOriginal ? product.originalPrice : "";
  document.getElementById("original-price-info").style.display = hasOriginal ? "block" : "none";
  document.getElementById("productSize").style.display = product.size ? "block" : "none";
  document.getElementById("productColor").style.display = product.color ? "block" : "none";
}

const sendExtractMessage = (tabId) => chrome.tabs.sendMessage(tabId, { action: MESSAGE_TYPES.EXTRACT_PRODUCT });

export async function loadCurrentProduct() {
  setLoading(true);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const supported = SUPPORTED_PRODUCT_HOSTS.some((host) => (tab?.url || "").includes(host));
    if (!supported) {
      showEmptyProduct("⚠️ Không phải trang Tmall/Taobao");
      return;
    }

    let response;
    try {
      response = await sendExtractMessage(tab.id);
    } catch (error) {
      if (!error.message.includes("Receiving end does not exist")) throw error;
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["extension-src/content/scraper.js", "content.js"],
      });
      response = await sendExtractMessage(tab.id);
    }

    if (response?.success && response.data?.title) {
      currentProduct = response.data;
      await displayProduct(currentProduct);
    } else {
      showEmptyProduct("⚠️ Không phát hiện sản phẩm trên trang này");
    }
  } catch (error) {
    console.error("Product extraction failed:", error);
    showEmptyProduct("❌ Lỗi khi tải sản phẩm");
  } finally {
    setLoading(false);
  }
}
