import type { AuthProvider } from "@refinedev/core";
import { ClientError, GraphQLClient } from "graphql-request";
import {
  GRAPHQL_API_URL,
  getGraphqlAuthToken,
  setGraphqlAuthToken,
} from "./graphqlClient";
import type { User } from "../types";

export const AUTH_USER_STORAGE_KEY = "user";

type LoginUser = User;

type LoginResponse = {
  login: {
    access_token: string;
    token_type: string;
    user: LoginUser;
  } | null;
};

const loginClient = new GraphQLClient(GRAPHQL_API_URL);

const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      access_token
      token_type
      user {
        id
        name
        email
      }
    }
  }
`;

const clearStoredAuth = () => {
  setGraphqlAuthToken(null);
  localStorage.removeItem(AUTH_USER_STORAGE_KEY);
};

const isUnauthenticatedError = (error: unknown) =>
  error instanceof ClientError &&
  error.response.errors?.some((item) => item.message === "Unauthenticated.");

const getStoredUser = () => {
  const rawUser = localStorage.getItem(AUTH_USER_STORAGE_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as LoginUser;
  } catch {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    return null;
  }
};

const getLoginRedirect = (params?: { redirect?: string; to?: string }) =>
  params?.redirect || params?.to || "/orders/external/create";

const getAuthRedirect = () =>
  `/login?redirect=${encodeURIComponent(
    `${window.location.pathname}${window.location.search}`,
  )}`;

export const authProvider: AuthProvider = {
  login: async (params) => {
    const email = typeof params?.email === "string" ? params.email.trim() : "";
    const password = typeof params?.password === "string" ? params.password : "";

    if (!email || !password) {
      return {
        success: false,
        error: new Error("Vui lÃ²ng nháº­p email vÃ  máº­t kháº©u."),
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
          error: new Error("ÄÄƒng nháº­p tháº¥t báº¡i."),
        };
      }

      setGraphqlAuthToken(payload.access_token);
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(payload.user));

      return {
        success: true,
        redirectTo: getLoginRedirect(params),
      };
    } catch (error) {
      const errorMessage =
        error instanceof ClientError
          ? error.response.errors?.[0]?.message || "ÄÄƒng nháº­p tháº¥t báº¡i."
          : error instanceof Error
            ? error.message
            : "ÄÄƒng nháº­p tháº¥t báº¡i.";

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
  // check: async () => {
  //   const token = getGraphqlAuthToken();

  //   if (!token) {
  //     return {
  //       authenticated: false,
  //       redirectTo: getAuthRedirect(),
  //       logout: false,
  //     };
  //   }

  //   try {
  //     const authClient = new GraphQLClient(GRAPHQL_API_URL, {
  //       headers: {
  //         Authorization: `Bearer ${token}`,
  //       },
  //     });
  //     const response = await authClient.request<MeResponse>(ME_QUERY);

  //     if (response.me) {
  //       localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(response.me));

  //       return {
  //         authenticated: true,
  //       };
  //     }
  //   } catch (error) {
  //     if (!isUnauthenticatedError(error)) {
  //       throw error;
  //     }
  //   }

  //   clearStoredAuth();

  //   return {
  //     authenticated: false,
  //     redirectTo: getAuthRedirect(),
  //     logout: true,
  //   };
  // },
  
  check: async () => {
  const token = getGraphqlAuthToken();

  if (token) {
    return { authenticated: true };
  }

  return {
    authenticated: false,
    redirectTo: getAuthRedirect(),
    logout: false,
  };
},
  getIdentity: async () => {
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
