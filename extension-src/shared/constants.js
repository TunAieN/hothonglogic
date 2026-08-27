export const MESSAGE_TYPES = Object.freeze({
  ADD_TO_CART: "addToCart",
  GET_CART: "getCart",
  CLEAR_CART: "clearCart",
  REMOVE_FROM_CART: "removeFromCart",
  OPEN_LOGIN: "openLogin",
  EXTRACT_PRODUCT: "extractProduct",
});

export const STORAGE_KEYS = Object.freeze({
  ENVIRONMENT: "environment",
  API_ENDPOINT: "apiEndpoint",
  ADMIN_ORDER_URL: "frontendOrderUrl",
  AUTO_EXTRACT: "autoExtract",
  TOKEN: "token",
  USER: "user",
  CART: "cart",
  CURRENT_PRODUCT: "currentProduct",
});

export const SUPPORTED_PRODUCT_HOSTS = Object.freeze(["tmall.com", "taobao.com"]);
