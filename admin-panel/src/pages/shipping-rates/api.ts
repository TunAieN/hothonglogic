import { ClientError } from "graphql-request";
import { client, syncGraphqlAuthToken } from "../../providers/graphqlClient";

export type ShippingRateDetail = {
  id?: string;
  min_weight?: number | null;
  max_weight?: number | null;
  price: number;
  price_type: "fixed" | "per_kg";
  description?: string | null;
  sort_order?: number | null;
};

export type ShippingRate = {
  id: string;
  name: string;
  customer_type?: string | null;
  route_type?: string | null;
  warehouse_id?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  status: string;
  note?: string | null;
  details: ShippingRateDetail[];
};

export type ShippingRateSaveInput = Omit<ShippingRate, "id" | "details"> & {
  details: Array<Omit<ShippingRateDetail, "id">>;
};

const RATE_FIELDS = `
  id
  name
  customer_type
  route_type
  warehouse_id
  effective_from
  effective_to
  status
  note
  details { id min_weight max_weight price price_type description sort_order }
`;

const requestGraphql = async <TResult, TVariables extends Record<string, unknown>>(query: string, variables: TVariables) => {
  syncGraphqlAuthToken();
  return client.request<TResult>(query, variables as never);
};

export const getShippingRateErrorMessage = (error: unknown) => {
  if (error instanceof ClientError) {
    const graphQLError = error.response.errors?.[0];
    const debugMessage = graphQLError?.extensions?.debugMessage;
    return typeof debugMessage === "string" && debugMessage.trim() ? debugMessage : graphQLError?.message ?? "Lỗi GraphQL.";
  }
  return error instanceof Error ? error.message : "Có lỗi không xác định.";
};

export const fetchShippingRates = async (status?: string) => {
  const query = `
    query ShippingRates($page: Int!, $first: Int!, $filter: ShippingRateFilterInput) {
      shippingRates(page: $page, first: $first, filter: $filter) {
        data { ${RATE_FIELDS} }
      }
    }
  `;
  const res = await requestGraphql<{ shippingRates: { data: ShippingRate[] } }, { page: number; first: number; filter?: { status: string } }>(query, {
    page: 1,
    first: 100,
    ...(status ? { filter: { status } } : {}),
  });
  return res.shippingRates.data;
};

export const saveShippingRate = async (input: ShippingRateSaveInput, id?: string) => {
  const mutation = id
    ? `mutation UpdateShippingRate($id: ID!, $input: ShippingRateInput!) { updateShippingRate(id: $id, input: $input) { ${RATE_FIELDS} } }`
    : `mutation CreateShippingRate($input: ShippingRateInput!) { createShippingRate(input: $input) { ${RATE_FIELDS} } }`;
  const normalizedInput = {
    ...input,
    details: input.details.map((detail) => ({
      min_weight: detail.min_weight,
      max_weight: detail.max_weight,
      price: detail.price,
      price_type: detail.price_type,
      description: detail.description,
      sort_order: detail.sort_order,
    })),
  };
  const variables = id ? { id, input: normalizedInput } : { input: normalizedInput };
  const res = await requestGraphql<{ updateShippingRate?: ShippingRate; createShippingRate?: ShippingRate }, typeof variables>(mutation, variables);
  return res.updateShippingRate ?? res.createShippingRate!;
};

export const deactivateShippingRate = async (id: string) => {
  const mutation = `mutation DeactivateShippingRate($id: ID!) { deactivateShippingRate(id: $id) { ${RATE_FIELDS} } }`;
  const res = await requestGraphql<{ deactivateShippingRate: ShippingRate }, { id: string }>(mutation, { id });
  return res.deactivateShippingRate;
};
