import type { AuthProvider } from "@refinedev/core";
import { ClientError, GraphQLClient } from "graphql-request";
import {
  GRAPHQL_API_URL,
  getGraphqlAuthToken,
  setGraphqlAuthToken,
} from "./graphqlClient";
import type { User } from "../shared/types";
import { getTtlCache, removeTtlCache, setTtlCache } from "../shared/utils/ttlCache";

export const AUTH_USER_STORAGE_KEY = "user";
const AUTH_IDENTITY_CACHE_KEY = "auth:identity";
const AUTH_IDENTITY_TTL_MS = 5 * 60 * 1000;

type LoginUser = User;

type LoginResponse = {
  login: {
    access_token: string;
    token_type: string;
    user: LoginUser;
  } | null;
};

const loginClient = new GraphQLClient(GRAPHQL_API_URL);

type MeResponse = {
  me: LoginUser | null;
};

const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      access_token
      token_type
      user {
        id
        name
        email
        role_id
        role {
          id
          name
          permissions
        }
      }
    }
  }
`;

const ME_QUERY = `
  query Me {
    me {
      id
      name
      email
      role_id
      role {
        id
        name
        permissions
      }
    }
  }
`;

let authUserMemoryCache: LoginUser | null = null;
let authUserRequest: Promise<LoginUser | null> | null = null;

const setCachedUser = (user: LoginUser | null) => {
  authUserMemoryCache = user;

  if (user) {
    localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
    setTtlCache(AUTH_IDENTITY_CACHE_KEY, user, AUTH_IDENTITY_TTL_MS);
    return;
  }

  localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  removeTtlCache(AUTH_IDENTITY_CACHE_KEY);
};

const clearStoredAuth = () => {
  authUserMemoryCache = null;
  authUserRequest = null;
  setGraphqlAuthToken(null);
  setCachedUser(null);
};

const isUnauthenticatedError = (error: unknown) =>
  error instanceof ClientError &&
  error.response.errors?.some((item) => item.message === "Unauthenticated.");

const getStoredUser = () => {
  if (authUserMemoryCache) {
    return authUserMemoryCache;
  }

  const cachedUser = getTtlCache<LoginUser>(AUTH_IDENTITY_CACHE_KEY);

  if (cachedUser) {
    authUserMemoryCache = cachedUser;
    return cachedUser;
  }

  const rawUser = localStorage.getItem(AUTH_USER_STORAGE_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    const user = JSON.parse(rawUser) as LoginUser;
    authUserMemoryCache = user;
    setTtlCache(AUTH_IDENTITY_CACHE_KEY, user, AUTH_IDENTITY_TTL_MS);
    return user;
  } catch {
    setCachedUser(null);
    return null;
  }
};

const getLoginRedirect = (params?: { redirect?: string; to?: string }) =>
  params?.redirect || params?.to || "/orders/external/create";

const getAuthRedirect = () =>
  `/login?redirect=${encodeURIComponent(
    `${window.location.pathname}${window.location.search}`,
  )}`;

const fetchCurrentUser = async () => {
  const token = getGraphqlAuthToken();

  if (!token) {
    authUserMemoryCache = null;
    return null;
  }

  if (authUserRequest) {
    return authUserRequest;
  }

  const authClient = new GraphQLClient(GRAPHQL_API_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  authUserRequest = authClient
    .request<MeResponse>(ME_QUERY)
    .then((response) => {
      setCachedUser(response.me);
      return response.me;
    })
    .finally(() => {
      authUserRequest = null;
    });

  return authUserRequest;
};

export const authProvider: AuthProvider = {
  login: async (params) => {
    const email = typeof params?.email === "string" ? params.email.trim() : "";
    const password = typeof params?.password === "string" ? params.password : "";

    if (!email || !password) {
      return {
        success: false,
        error: new Error("Vui lòng nhập email và mật khẩu."),
      };
    }

    try {
      const response = await loginClient.request<LoginResponse>(LOGIN_MUTATION, {
        email,
        password,
      });
      const payload = response.login;

      if (!payload?.access_token) {
        return {
          success: false,
          error: new Error("Đăng nhập thất bại."),
        };
      }

      setGraphqlAuthToken(payload.access_token);
      setCachedUser(payload.user);

      return {
        success: true,
        redirectTo: getLoginRedirect(params),
      };
    } catch (error) {
      const errorMessage =
        error instanceof ClientError
          ? error.response.errors?.[0]?.message || "Đăng nhập thất bại."
          : error instanceof Error
            ? error.message
            : "Đăng nhập thất bại.";

      return {
        success: false,
        error: new Error(errorMessage),
      };
    }
  },
  logout: async () => {
    clearStoredAuth();

    return {
      success: true,
      redirectTo: "/login",
    };
  },
  check: async () => {
    const token = getGraphqlAuthToken();

    if (!token) {
      return {
        authenticated: false,
        redirectTo: getAuthRedirect(),
        logout: false,
      };
    }

    try {
      const cachedUser = getStoredUser();

      if (cachedUser) {
        return {
          authenticated: true,
        };
      }

      const user = await fetchCurrentUser();

      if (user) {
        return {
          authenticated: true,
        };
      }
    } catch (error) {
      if (!isUnauthenticatedError(error)) {
        throw error;
      }
    }

    clearStoredAuth();

    return {
      authenticated: false,
      redirectTo: getAuthRedirect(),
      logout: true,
    };
  },
  getIdentity: async () => {
    const cachedUser = getStoredUser();

    if (cachedUser) {
      return cachedUser;
    }

    try {
      const user = await fetchCurrentUser();

      if (user) {
        return user;
      }
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        clearStoredAuth();
        return null;
      }

      throw error;
    }

    return getStoredUser();
  },
  onError: async (error) => {
    if (isUnauthenticatedError(error)) {
      clearStoredAuth();

      return {
        logout: true,
        redirectTo: "/login",
        error: new Error("Phiên đăng nhập đã hết hạn."),
      };
    }

    return {};
  },
};
