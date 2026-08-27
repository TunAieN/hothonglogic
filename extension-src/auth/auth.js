import { STORAGE_KEYS } from "../shared/constants.js";
import {
  getStoredValues,
  removeStoredValues,
  setStoredValues,
} from "../storage/storage.js";

export async function getAuthSession() {
  const stored = await getStoredValues([STORAGE_KEYS.TOKEN, STORAGE_KEYS.USER]);
  return {
    token: stored[STORAGE_KEYS.TOKEN] || null,
    user: stored[STORAGE_KEYS.USER] || null,
  };
}

export const saveAuthSession = (token, user) => setStoredValues({ token, user });

export const clearAuthSession = () =>
  removeStoredValues([STORAGE_KEYS.TOKEN, STORAGE_KEYS.USER]);
