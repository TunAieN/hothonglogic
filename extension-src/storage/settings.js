import {
  ACTIVE_EXTENSION_ENVIRONMENT,
  getEnvironmentConfig,
} from "../config/environment.js";

const SETTINGS_KEYS = [
  "environment",
  "apiEndpoint",
  "frontendOrderUrl",
  "autoExtract",
  "token",
];

export const getDefaultSettings = () => {
  const environment = ACTIVE_EXTENSION_ENVIRONMENT;
  const config = getEnvironmentConfig(environment);

  return {
    environment,
    apiEndpoint: config.graphqlEndpoint,
    frontendOrderUrl: config.adminOrderUrl,
    autoExtract: true,
    token: null,
  };
};

export const loadExtensionSettings = async () => {
  const defaults = getDefaultSettings();
  const stored = await chrome.storage.local.get(SETTINGS_KEYS);

  return {
    environment: stored.environment || defaults.environment,
    apiEndpoint: stored.apiEndpoint || defaults.apiEndpoint,
    frontendOrderUrl: stored.frontendOrderUrl || defaults.frontendOrderUrl,
    autoExtract: stored.autoExtract !== false,
    token: stored.token || null,
  };
};

export const saveExtensionSettings = async (nextSettings) => {
  const current = await loadExtensionSettings();
  const normalized = {
    ...current,
    ...nextSettings,
    apiEndpoint: nextSettings.apiEndpoint?.trim() || current.apiEndpoint,
    frontendOrderUrl: nextSettings.frontendOrderUrl?.trim() || current.frontendOrderUrl,
  };

  await chrome.storage.local.set(normalized);

  return normalized;
};

export const initializeExtensionStorage = async () => {
  const defaults = getDefaultSettings();
  const stored = await chrome.storage.local.get([...SETTINGS_KEYS, "cart"]);
  const missingValues = {};

  for (const [key, value] of Object.entries(defaults)) {
    if (stored[key] === undefined) {
      missingValues[key] = value;
    }
  }

  if (!Array.isArray(stored.cart)) {
    missingValues.cart = [];
  }

  if (Object.keys(missingValues).length > 0) {
    await chrome.storage.local.set(missingValues);
  }
};
