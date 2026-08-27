import { BACKEND_API_URL } from "../providers/graphqlClient";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const resolveMediaUrl = (value?: string | null, backendBaseUrl?: string) => {
  const rawValue = value?.trim();
  if (!rawValue) return "";

  const baseUrl = trimTrailingSlash(typeof backendBaseUrl === "string" ? backendBaseUrl : BACKEND_API_URL);
  if (/^https?:\/\//i.test(rawValue)) {
    try {
      const parsed = new URL(rawValue);
      const isLegacyLocalStorageUrl = ["localhost", "127.0.0.1"].includes(parsed.hostname)
        && parsed.pathname.startsWith("/storage/");
      return isLegacyLocalStorageUrl
        ? `${baseUrl}${parsed.pathname}${parsed.search}${parsed.hash}`
        : rawValue;
    } catch {
      return rawValue;
    }
  }

  if (rawValue.startsWith("/storage/")) return `${baseUrl}${rawValue}`;
  if (rawValue.startsWith("storage/")) return `${baseUrl}/${rawValue}`;

  return `${baseUrl}/storage/${rawValue.replace(/^\/+/, "")}`;
};

export const MEDIA_IMAGE_FALLBACK = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180">
    <rect width="240" height="180" fill="#f5f5f5"/>
    <path d="M92 70h56v40H92z" fill="none" stroke="#bfbfbf" stroke-width="4"/>
    <circle cx="106" cy="82" r="5" fill="#bfbfbf"/>
    <path d="m96 104 14-14 10 10 8-8 16 16" fill="none" stroke="#bfbfbf" stroke-width="4"/>
    <text x="120" y="137" text-anchor="middle" font-family="Arial" font-size="13" fill="#8c8c8c">Khong tai duoc anh</text>
  </svg>
`)}`;
