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
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(payload.user));

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
    setGraphqlAuthToken(null);
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);

    return {
      success: true,
      redirectTo: "/login",
    };
  },
  check: async () => {
    const token = getGraphqlAuthToken();

    if (token) {
      return {
        authenticated: true,
      };
    }

    const redirect = `${window.location.pathname}${window.location.search}`;

    return {
      authenticated: false,
      redirectTo: `/login?redirect=${encodeURIComponent(redirect)}`,
      logout: false,
    };
  },
  getIdentity: async () => {
    return getStoredUser();
  },
  onError: async () => {
    return {};
  },
};
