import { graphqlRequest } from "./graphqlClient.js";

const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      access_token
      user {
        id
        name
        email
      }
    }
  }
`;

const LOGOUT_MUTATION = `
  mutation Logout {
    logout
  }
`;

export async function login({ endpoint, email, password }) {
  const data = await graphqlRequest({
    endpoint,
    query: LOGIN_MUTATION,
    variables: { email, password },
  });

  if (!data?.login) {
    throw new Error("Sai tài khoản hoặc mật khẩu.");
  }

  return data.login;
}

export async function logout({ endpoint, token }) {
  const data = await graphqlRequest({ endpoint, query: LOGOUT_MUTATION, token });

  if (data?.logout !== true) {
    throw new Error("Máy chủ chưa xác nhận thu hồi phiên đăng nhập.");
  }

  return true;
}
