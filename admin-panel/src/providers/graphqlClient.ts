import { GraphQLClient } from "graphql-request";

export const BACKEND_API_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
export const GRAPHQL_API_URL = `${BACKEND_API_URL}/graphql`;
export const GRAPHQL_AUTH_TOKEN_STORAGE_KEY = "token";

export const client = new GraphQLClient(GRAPHQL_API_URL);

const normalizeGraphqlAuthToken = (token?: string | null) => {
  const rawToken = token?.trim();

  if (!rawToken) {
    return null;
  }

  return rawToken.replace(/^Bearer\s+/i, "");
};

export const getGraphqlAuthToken = () =>
  normalizeGraphqlAuthToken(localStorage.getItem(GRAPHQL_AUTH_TOKEN_STORAGE_KEY));

export const getGraphqlAuthHeaders = (): Record<string, string> => {
  const token = getGraphqlAuthToken();

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

export const setGraphqlAuthToken = (token?: string | null) => {
  const normalizedToken = normalizeGraphqlAuthToken(token);

  if (normalizedToken) {
    localStorage.setItem(GRAPHQL_AUTH_TOKEN_STORAGE_KEY, normalizedToken);
    client.setHeader("Authorization", `Bearer ${normalizedToken}`);
    return;
  }

  localStorage.removeItem(GRAPHQL_AUTH_TOKEN_STORAGE_KEY);
  client.setHeaders({});
};

export const syncGraphqlAuthToken = () => {
  const token = getGraphqlAuthToken();

  if (token) {
    client.setHeader("Authorization", `Bearer ${token}`);
    return token;
  }

  client.setHeaders({});
  return null;
};

syncGraphqlAuthToken();
