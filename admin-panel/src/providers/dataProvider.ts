import type {
  BaseRecord,
  DataProvider,
  DeleteOneParams,
  GetListParams,
  GetOneParams,
} from "@refinedev/core";
import { client, GRAPHQL_API_URL } from "./graphqlClient";
import { fieldMap, resourceGraphqlMap, type MutationConfig, type ResourceGraphqlConfig, type ResourceName } from "../graphql";
import type {
  Customer,
  CustomerCreateInput,
  CustomerUpdateInput,
  Order,
  OrderCreateInput,
  OrderUpdateInput,
} from "../types";

type ResourceRecordMap = {
  customers: Customer;
  orders: Order;
};

type ResourceCreateInputMap = {
  customers: CustomerCreateInput;
  orders: OrderCreateInput;
};

type ResourceUpdateInputMap = {
  customers: CustomerUpdateInput;
  orders: OrderUpdateInput;
};

type PaginatedResponse<TRecord> = {
  data: TRecord[];
  paginatorInfo: {
    total: number;
  };
};

type ListGraphQLResponse<TResource extends ResourceName> = Record<
  TResource,
  PaginatedResponse<ResourceRecordMap[TResource]>
>;

type DetailGraphQLResponse<TResource extends ResourceName> = Record<
  string,
  ResourceRecordMap[TResource] | null
>;

type MutationGraphQLResponse<TResource extends ResourceName> = Record<
  string,
  ResourceRecordMap[TResource] | null
>;

const getResourceConfig = (resource: string): ResourceGraphqlConfig => {
  const config = resourceGraphqlMap[resource as ResourceName];

  if (!config) {
    throw new Error(`Resource "${resource}" is not configured in graphql/index.ts.`);
  }

  return config;
};

const getPagination = (pagination?: GetListParams["pagination"]) => {
  const legacyPagination = pagination as (typeof pagination & { current?: number }) | undefined;

  return {
    page: legacyPagination?.currentPage ?? legacyPagination?.current ?? 1,
    perPage: legacyPagination?.pageSize ?? 10,
  };
};

const buildListQuery = (queryName: string, fields: string) => `
  query ($page: Int!, $first: Int!) {
    ${queryName}(first: $first, page: $page) {
      data {
        ${fields}
      }
      paginatorInfo {
        total
      }
    }
  }
`;

const buildDetailQuery = (queryName: string, fields: string) => `
  query ($id: ID!) {
    ${queryName}(id: $id) {
      ${fields}
    }
  }
`;

const buildMutation = (mutation: MutationConfig) => `
  mutation (${mutation.variableDefinitions}) {
    ${mutation.operationName}(${mutation.arguments}) {
      ${mutation.fields}
    }
  }
`;

const getMutationConfig = (
  resource: string,
  mutationName: keyof ResourceGraphqlConfig["mutations"],
) => {
  const config = getResourceConfig(resource);
  const mutation = config.mutations[mutationName];

  if (!mutation) {
    throw new Error(
      `Mutation "${String(mutationName)}" is not configured for resource "${resource}".`,
    );
  }

  return mutation;
};

const getListByResource = async <TResource extends ResourceName>(
  resource: TResource,
  pagination?: GetListParams["pagination"],
) => {
  const config = getResourceConfig(resource);
  const fields = fieldMap[resource].list;
  const { page, perPage } = getPagination(pagination);
  const query = buildListQuery(config.listQueryName, fields);
  const response = await client.request<ListGraphQLResponse<TResource>>(query, {
    page,
    first: perPage,
  });
  const result = response[config.listQueryName as TResource];

  return {
    data: result.data,
    total: result.paginatorInfo.total,
  };
};

const getOneByResource = async <TResource extends ResourceName>(
  resource: TResource,
  id: GetOneParams["id"],
) => {
  const config = getResourceConfig(resource);
  const fields = fieldMap[resource].detail;
  const query = buildDetailQuery(config.detailQueryName, fields);
  const response = await client.request<DetailGraphQLResponse<TResource>>(query, { id });
  const data = response[config.detailQueryName];

  if (!data) {
    throw new Error(`Resource "${resource}" with id "${String(id)}" was not found.`);
  }

  return { data };
};

const createByResource = async <TResource extends ResourceName>(
  resource: TResource,
  values: ResourceCreateInputMap[TResource],
) => {
  const mutation = getMutationConfig(resource, "create");
  const query = buildMutation(mutation);
  const response = await client.request<MutationGraphQLResponse<TResource>>(query, {
    input: values,
  });
  const data = response[mutation.operationName];

  if (!data) {
    throw new Error(`Create mutation for resource "${resource}" returned no data.`);
  }

  return { data };
};

const updateByResource = async <TResource extends ResourceName>(
  resource: TResource,
  id: GetOneParams["id"],
  values: ResourceUpdateInputMap[TResource],
) => {
  const mutation = getMutationConfig(resource, "update");
  const query = buildMutation(mutation);
  const response = await client.request<MutationGraphQLResponse<TResource>>(query, {
    id,
    input: values,
  });
  const data = response[mutation.operationName];

  if (!data) {
    throw new Error(`Update mutation for resource "${resource}" returned no data.`);
  }

  return { data };
};

const deleteByResource = async <TResource extends ResourceName>(
  resource: TResource,
  id: DeleteOneParams["id"],
) => {
  const mutation = getMutationConfig(resource, "deleteOne");
  const query = buildMutation(mutation);
  const response = await client.request<MutationGraphQLResponse<TResource>>(query, { id });
  const data = response[mutation.operationName];

  if (!data) {
    throw new Error(`Delete mutation for resource "${resource}" returned no data.`);
  }

  return { data };
};

const getList: DataProvider["getList"] = async <TData extends BaseRecord = BaseRecord>(
  params: Parameters<NonNullable<DataProvider["getList"]>>[0],
) => {
  const result = await getListByResource(
    params.resource as ResourceName,
    params.pagination,
  );

  return {
    data: result.data as unknown as TData[],
    total: result.total,
  };
};

const getOne: DataProvider["getOne"] = async <TData extends BaseRecord = BaseRecord>(
  params: Parameters<NonNullable<DataProvider["getOne"]>>[0],
) => {
  const result = await getOneByResource(params.resource as ResourceName, params.id);

  return {
    data: result.data as unknown as TData,
  };
};

const create: DataProvider["create"] = async <TData extends BaseRecord = BaseRecord>(
  params: Parameters<NonNullable<DataProvider["create"]>>[0],
) => {
  const result = await createByResource(
    params.resource as ResourceName,
    params.variables as ResourceCreateInputMap[ResourceName],
  );

  return {
    data: result.data as unknown as TData,
  };
};

const update: DataProvider["update"] = async <TData extends BaseRecord = BaseRecord>(
  params: Parameters<NonNullable<DataProvider["update"]>>[0],
) => {
  const result = await updateByResource(
    params.resource as ResourceName,
    params.id,
    params.variables as ResourceUpdateInputMap[ResourceName],
  );

  return {
    data: result.data as unknown as TData,
  };
};

const deleteOne: DataProvider["deleteOne"] = async <TData extends BaseRecord = BaseRecord>(
  params: Parameters<NonNullable<DataProvider["deleteOne"]>>[0],
) => {
  const result = await deleteByResource(params.resource as ResourceName, params.id);

  return {
    data: result.data as unknown as TData,
  };
};

export const dataProvider: DataProvider = {
  getList,
  getOne,
  create,
  update,
  deleteOne,
  getApiUrl: () => GRAPHQL_API_URL,
};
