import { graphqlRequest } from "./graphqlClient.js";

const CUSTOMERS_QUERY = `
  query {
    customers {
      data {
        id
        code
        name
        phone
      }
      paginatorInfo {
        total
      }
    }
  }
`;

export async function fetchCustomers({ endpoint, token }) {
  const data = await graphqlRequest({ endpoint, query: CUSTOMERS_QUERY, token });
  if (!data?.customers) {
    throw new Error("Không thể tải khách hàng");
  }
  return data.customers.data || [];
}
