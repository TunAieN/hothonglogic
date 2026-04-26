import { CUSTOMER_FIELDS, customersGraphql } from "./customers";
import { ORDER_FIELDS, ordersGraphql } from "./orders";

export const fieldMap = {
  customers: CUSTOMER_FIELDS,
  orders: ORDER_FIELDS,
} as const;

export const resourceGraphqlMap = {
  customers: customersGraphql,
  orders: ordersGraphql,
} as const;

export type ResourceName = keyof typeof resourceGraphqlMap;

export type ResourceMutationName = keyof typeof customersGraphql.mutations;

export type MutationConfig = {
  operationName: string;
  variableDefinitions: string;
  arguments: string;
  fields: string;
};

export type ResourceGraphqlConfig = {
  resource: ResourceName;
  listQueryName: string;
  detailQueryName: string;
  fields: {
    list: string;
    detail: string;
    mutation: string;
  };
  mutations: Partial<Record<ResourceMutationName, MutationConfig>>;
};
