import { CN_BATCH_FIELDS, cnBatchesGraphql } from "./cnBatches";
import { CN_PACKAGE_FIELDS, cnPackagesGraphql } from "./cnPackages";
import { CUSTOMER_FIELDS, customersGraphql } from "./customers";
import { ORDER_FIELDS, ordersGraphql } from "./orders";
import { USER_FIELDS, usersGraphql } from "./users";

export const fieldMap = {
  cnBatches: CN_BATCH_FIELDS,
  cnPackages: CN_PACKAGE_FIELDS,
  customers: CUSTOMER_FIELDS,
  orders: ORDER_FIELDS,
  users: USER_FIELDS,
} as const;

export const resourceGraphqlMap = {
  cnBatches: cnBatchesGraphql,
  cnPackages: cnPackagesGraphql,
  customers: customersGraphql,
  orders: ordersGraphql,
  users: usersGraphql,
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
