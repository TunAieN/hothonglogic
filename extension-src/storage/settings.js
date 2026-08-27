import { ACTIVE_ENVIRONMENT, getEnvironmentConfig } from "../config/config.js";
import { STORAGE_KEYS } from "../shared/constants.js";
import { getStoredValues, setStoredValues } from "./storage.js";

const SETTINGS_KEYS = [
  STORAGE_KEYS.ENVIRONMENT,
  STORAGE_KEYS.API_ENDPOINT,
  STORAGE_KEYS.ADMIN_ORDER_URL,
  STORAGE_KEYS.AUTO_EXTRACT,
  STORAGE_KEYS.TOKEN,
];

export const getDefaultSettings = () => {
  const environment = ACTIVE_ENVIRONMENT;
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
  const stored = await getStoredValues(SETTINGS_KEYS);

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

  await setStoredValues(normalized);

  return normalized;
};

export const initializeExtensionStorage = async () => {
  const defaults = getDefaultSettings();
  const stored = await getStoredValues([...SETTINGS_KEYS, STORAGE_KEYS.CART]);
  const missingValues = {};

  for (const [key, value] of Object.entries(defaults)) {
    if (stored[key] === undefined) {
      missingValues[key] = value;
    }
  }

  if (!Array.isArray(stored[STORAGE_KEYS.CART])) {
    missingValues[STORAGE_KEYS.CART] = [];
  }

  if (Object.keys(missingValues).length > 0) {
    await setStoredValues(missingValues);
  }
};
