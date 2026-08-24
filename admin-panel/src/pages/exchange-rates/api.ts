import { gql } from "graphql-request";
import { client } from "../../providers/graphqlClient";

export type ExchangeRate = {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  effective_from?: string | null;
  effective_to?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  creator?: { id: string; name: string } | null;
};

export type ExchangeRateInput = {
  from_currency?: string;
  to_currency?: string;
  rate: number;
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean;
};

const FIELDS = `
  id
  from_currency
  to_currency
  rate
  effective_from
  effective_to
  is_active
  created_at
  updated_at
  creator { id name }
`;

export const fetchExchangeRates = async () => {
  const query = gql`
    query ExchangeRates {
      exchangeRates(first: 100) { data { ${FIELDS} } }
    }
  `;
  const response = await client.request<{ exchangeRates: { data: ExchangeRate[] } }>(query);
  return response.exchangeRates.data;
};

export const createExchangeRate = async (input: ExchangeRateInput) => {
  const mutation = gql`
    mutation CreateExchangeRate($input: ExchangeRateInput!) {
      createExchangeRate(input: $input) { ${FIELDS} }
    }
  `;
  const response = await client.request<{ createExchangeRate: ExchangeRate }>(mutation, { input });
  return response.createExchangeRate;
};

export const activateExchangeRate = async (id: string) => {
  const mutation = gql`
    mutation ActivateExchangeRate($id: ID!) {
      activateExchangeRate(id: $id) { ${FIELDS} }
    }
  `;
  const response = await client.request<{ activateExchangeRate: ExchangeRate }>(mutation, { id });
  return response.activateExchangeRate;
};

export const deactivateExchangeRate = async (id: string) => {
  const mutation = gql`
    mutation DeactivateExchangeRate($id: ID!) {
      deactivateExchangeRate(id: $id) { ${FIELDS} }
    }
  `;
  const response = await client.request<{ deactivateExchangeRate: ExchangeRate }>(mutation, { id });
  return response.deactivateExchangeRate;
};