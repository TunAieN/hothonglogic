import { STORAGE_KEYS } from "../shared/constants.js";
import { getStoredValues, setStoredValues } from "./storage.js";

export async function getCart() {
  const stored = await getStoredValues([STORAGE_KEYS.CART]);
  return Array.isArray(stored[STORAGE_KEYS.CART]) ? stored[STORAGE_KEYS.CART] : [];
}

export async function saveCart(cart) {
  await setStoredValues({ [STORAGE_KEYS.CART]: cart });
  return cart;
}

export async function addCartItem(productData) {
  const cart = await getCart();
  const cartItem = {
    ...productData,
    id: productData.id || Date.now(),
    addedAt: productData.addedAt || new Date().toISOString(),
  };

  cart.push(cartItem);
  await saveCart(cart);
  return cartItem;
}

export async function removeCartItem(index) {
  const cart = await getCart();
  cart.splice(index, 1);
  await saveCart(cart);
}

export const clearCart = () => saveCart([]);
