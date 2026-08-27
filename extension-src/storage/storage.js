export const getStoredValues = (keys) => chrome.storage.local.get(keys);

export const setStoredValues = (values) => chrome.storage.local.set(values);

export const removeStoredValues = (keys) => chrome.storage.local.remove(keys);
