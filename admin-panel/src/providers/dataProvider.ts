import type {
  BaseRecord,
  DataProvider,
  DeleteOneParams,
  GetListParams,
  GetOneParams,
  CrudFilter,
  LogicalFilter,
} from "@refinedev/core";
import { client, getGraphqlAuthHeaders, GRAPHQL_API_URL, syncGraphqlAuthToken } from "./graphqlClient";
import { fieldMap, resourceGraphqlMap, type MutationConfig, type ResourceGraphqlConfig, type ResourceName } from "../graphql";
import type {
  CnBatch,
  CnBatchCreateInput,
  CnBatchUpdateInput,
  CnPackage,
  CnPackageCreateInput,
  CnPackageUpdateInput,
  Customer,
  CustomerCreateInput,
  CustomerUpdateInput,
  EmployeeCreateInput,
  EmployeeRecord,
  EmployeeUpdateInput,
  Order,
  OrderCreateInput,
  OrderUpdateInput,
  User,
} from "../shared/types";

type ResourceRecordMap = {
  cnBatches: CnBatch;
  cnPackages: CnPackage;
  customers: Customer;
  employees: EmployeeRecord;
  orders: Order;
  users: User;
};

type ResourceCreateInputMap = {
  cnBatches: CnBatchCreateInput;
  cnPackages: CnPackageCreateInput;
  customers: CustomerCreateInput;
  employees: EmployeeCreateInput;
  orders: OrderCreateInput;
  users: never;
};

type ResourceUpdateInputMap = {
  cnBatches: CnBatchUpdateInput;
  cnPackages: CnPackageUpdateInput;
  customers: CustomerUpdateInput;
  employees: EmployeeUpdateInput;
  orders: OrderUpdateInput;
  users: never;
};

type PaginatedResponse<TRecord> = {
  data: TRecord[];
  paginatorInfo: {
    total: number;
  };
};

type ListMetaOverrides = {
  fields?: string;
  listQueryName?: string;
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

const buildListQuery = (
  queryName: string,
  fields: string,
  listArguments = "first: $first, page: $page",
  variableDefinitions = "$page: Int!, $first: Int!",
) => `
  query (${variableDefinitions}) {
    ${queryName}(${listArguments}) {
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

const requestWithAuth = async <TResponse>(
  query: string,
  variables: object,
) => {
  syncGraphqlAuthToken();
  return client.request<TResponse>(query, variables, getGraphqlAuthHeaders());
};

type OrdersListFilter = {
  search?: string;
  customer_id?: string;
  created_by?: string;
  order_code?: string;
  status?: string;
  created_from?: string;
  created_to?: string;
};

type CustomersListFilter = {
  search?: string;
  status?: string;
  vip_group?: string;
  province?: string;
  phone?: string;
  created_from?: string;
  created_to?: string;
};

type EmployeesListFilter = {
  search?: string;
  role_id?: string;
  status?: string;
  department?: string;
  created_from?: string;
  created_to?: string;
};

const isLogicalFilter = (filter: CrudFilter): filter is LogicalFilter =>
  "field" in filter && "operator" in filter;

const normalizeFilterValue = (value: unknown) => {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized === "" ? undefined : normalized;
  }

  return value === null ? undefined : value;
};

const getOrdersListFilter = (filters?: GetListParams["filters"]): OrdersListFilter | undefined => {
  if (!filters) {
    return undefined;
  }

  const mappedFilter: OrdersListFilter = {};

  filters
    .filter(isLogicalFilter)
    .forEach((filter) => {
      const value = normalizeFilterValue(filter.value);

      if (value === undefined) {
        return;
      }

      switch (filter.field) {
        case "search":
          mappedFilter.search = String(value);
          break;
        case "customer_id":
          mappedFilter.customer_id = String(value);
          break;
        case "created_by":
          mappedFilter.created_by = String(value);
          break;
        case "order_code":
          mappedFilter.order_code = String(value);
          break;
        case "status":
          mappedFilter.status = String(value);
          break;
        case "created_from":
          mappedFilter.created_from = String(value);
          break;
        case "created_to":
          mappedFilter.created_to = String(value);
          break;
        default:
          break;
      }
    });

  return Object.keys(mappedFilter).length > 0 ? mappedFilter : undefined;
};

const getCustomersListFilter = (
  filters?: GetListParams["filters"],
): CustomersListFilter | undefined => {
  if (!filters) {
    return undefined;
  }

  const mappedFilter: CustomersListFilter = {};

  filters
    .filter(isLogicalFilter)
    .forEach((filter) => {
      const value = normalizeFilterValue(filter.value);

      if (value === undefined) {
        return;
      }

      switch (filter.field) {
        case "search":
          mappedFilter.search = String(value);
          break;
        case "status":
          mappedFilter.status = String(value);
          break;
        case "vip_group":
          mappedFilter.vip_group = String(value);
          break;
        case "province":
          mappedFilter.province = String(value);
          break;
        case "phone":
          mappedFilter.phone = String(value);
          break;
        case "created_from":
          mappedFilter.created_from = String(value);
          break;
        case "created_to":
          mappedFilter.created_to = String(value);
          break;
        default:
          break;
      }
    });

  return Object.keys(mappedFilter).length > 0 ? mappedFilter : undefined;
};

const getEmployeesListFilter = (
  filters?: GetListParams["filters"],
): EmployeesListFilter | undefined => {
  if (!filters) {
    return undefined;
  }

  const mappedFilter: EmployeesListFilter = {};

  filters
    .filter(isLogicalFilter)
    .forEach((filter) => {
      const value = normalizeFilterValue(filter.value);

      if (value === undefined) {
        return;
      }

      switch (filter.field) {
        case "search":
          mappedFilter.search = String(value);
          break;
        case "role_id":
          mappedFilter.role_id = String(value);
          break;
        case "department":
          mappedFilter.department = String(value);
          break;
        case "status":
          mappedFilter.status = String(value);
          break;
        case "created_from":
          mappedFilter.created_from = String(value);
          break;
        case "created_to":
          mappedFilter.created_to = String(value);
          break;
        default:
          break;
      }
    });

  return Object.keys(mappedFilter).length > 0 ? mappedFilter : undefined;
};

const getListByResource = async <TResource extends ResourceName>(
  resource: TResource,
  pagination?: GetListParams["pagination"],
  filters?: GetListParams["filters"],
  meta?: ListMetaOverrides,
) => {
  const config = getResourceConfig(resource);
  const listQueryName = meta?.listQueryName ?? config.listQueryName;
  const fields = meta?.fields ?? fieldMap[resource].list;
  const { page, perPage } = getPagination(pagination);
  const ordersFilter = resource === "orders" ? getOrdersListFilter(filters) : undefined;
  const customersFilter = resource === "customers" ? getCustomersListFilter(filters) : undefined;
  const employeesFilter = resource === "employees" ? getEmployeesListFilter(filters) : undefined;
  const query =
    resource === "orders"
      ? buildListQuery(
          listQueryName,
          fields,
          "first: $first, page: $page, filter: $filter",
          "$page: Int!, $first: Int!, $filter: OrderFilterInput",
        )
      : resource === "customers"
        ? buildListQuery(
            listQueryName,
            fields,
            "first: $first, page: $page, filter: $filter",
            "$page: Int!, $first: Int!, $filter: CustomerFilterInput",
          )
        : resource === "employees"
          ? buildListQuery(
              listQueryName,
              fields,
              "first: $first, page: $page, filter: $filter",
              "$page: Int!, $first: Int!, $filter: EmployeeFilterInput",
            )
          : buildListQuery(listQueryName, fields);
  const response = await requestWithAuth<ListGraphQLResponse<TResource>>(query, {
    page,
    first: perPage,
    ...(ordersFilter ? { filter: ordersFilter } : {}),
    ...(customersFilter ? { filter: customersFilter } : {}),
    ...(employeesFilter ? { filter: employeesFilter } : {}),
  });
  const result = response[listQueryName as TResource];

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
  const response = await requestWithAuth<DetailGraphQLResponse<TResource>>(query, { id });
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
  const response = await requestWithAuth<MutationGraphQLResponse<TResource>>(query, {
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
  const response = await requestWithAuth<MutationGraphQLResponse<TResource>>(query, {
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
  const response = await requestWithAuth<MutationGraphQLResponse<TResource>>(query, { id });
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
    params.filters,
    (params as GetListParams & { meta?: ListMetaOverrides }).meta,
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
