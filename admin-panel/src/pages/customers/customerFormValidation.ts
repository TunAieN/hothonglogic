export const PHONE_NUMBER_REGEX = /^\+?[1-9]\d{7,14}$/;

export const normalizeCustomerPhone = (value?: string | null) => {
  const rawValue = value?.trim() ?? "";
  const digitsOnly = rawValue.replace(/\D+/g, "");

  if (!digitsOnly) {
    return "";
  }

  return rawValue.startsWith("+") ? `+${digitsOnly}` : digitsOnly;
};

export const normalizeCustomerEmail = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase() ?? "";

  return normalized || null;
};

export const normalizeOptionalText = (value?: string | null) => {
  const normalized = value?.trim() ?? "";

  return normalized || null;
};

export const isValidCustomerPhone = (value?: string | null) =>
  PHONE_NUMBER_REGEX.test(normalizeCustomerPhone(value));
