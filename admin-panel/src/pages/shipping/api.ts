import { ClientError } from "graphql-request";
import { client, syncGraphqlAuthToken } from "../../providers/graphqlClient";
import type {
  CreateShippingTaskInput,
  ExportSlip,
  ExportSlipFilter,
  ExportSlipPage,
  ShippingQueueFilter,
  ShippingQueueOrder,
  ShippingQueuePage,
  ShippingTask,
  ShippingTaskFilter,
  ShippingTaskOptions,
  ShippingTaskPage,
} from "./types";

const PAGINATOR_FIELDS = "currentPage lastPage perPage total firstItem lastItem";
const QUEUE_FIELDS = `
  id order_code tracking_numbers customer_name customer_phone customer_address carrier payment_date
  package_count total_weight total_value status
  packages { id tracking_number length width height weight }
`;
const TASK_FIELDS = `
  id task_code export_slip_id export_code delivery_staff_id delivery_staff_name delivery_staff_phone carrier_name warehouse_name
  order_count total_packages total_weight total_value created_at scheduled_delivery_date status
  note service_type delivery_method estimated_shipping_fee cod_amount transport_note
  orders { id order_code customer_name package_count total_weight total_value }
`;
const SLIP_FIELDS = `
  id export_code task_id task_code status created_at scheduled_delivery_date creator_name
  delivery_staff_name delivery_staff_phone carrier_name warehouse_name note order_count total_packages total_weight total_value
`;

const request = async <T, V extends Record<string, unknown>>(query: string, variables: V) => {
  syncGraphqlAuthToken();
  return client.request<T>(query, variables as never);
};

export const shippingErrorMessage = (error: unknown) => {
  if (error instanceof ClientError) {
    const graphError = error.response.errors?.[0];
    const validation = graphError?.extensions?.validation as Record<string, string[]> | undefined;
    const firstValidation = validation ? Object.values(validation).flat()[0] : undefined;
    return firstValidation || graphError?.message || "Không thể xử lý yêu cầu xuất hàng.";
  }
  return error instanceof Error ? error.message : "Không thể xử lý yêu cầu xuất hàng.";
};

export const fetchShippingQueue = async (page: number, first: number, filter: ShippingQueueFilter) => {
  const query = `query ShippingQueue($page: Int!, $first: Int!, $filter: ShippingQueueFilterInput) {
    shippingQueueOrders(page: $page, first: $first, filter: $filter) {
      data { ${QUEUE_FIELDS} }
      stats { total_orders total_packages total_weight total_value }
      paginatorInfo { ${PAGINATOR_FIELDS} }
    }
  }`;
  const response = await request<{ shippingQueueOrders: ShippingQueuePage }, { page: number; first: number; filter: ShippingQueueFilter }>(query, { page, first, filter });
  return response.shippingQueueOrders;
};

export const fetchShippingQueueOptions = async (orderIds: string[]) => {
  const query = `query ShippingQueueOptions($orderIds: [ID!]!) {
    shippingQueueOrderOptions(order_ids: $orderIds) { ${QUEUE_FIELDS} }
  }`;
  const response = await request<{ shippingQueueOrderOptions: ShippingQueueOrder[] }, { orderIds: string[] }>(query, { orderIds });
  return response.shippingQueueOrderOptions;
};

export const fetchShippingTaskOptions = async () => {
  const query = `query ShippingTaskOptions {
    shippingTaskOptions {
      deliveryStaff { id name phone }
      warehouses { id name address }
      carriers { code name }
    }
  }`;
  const response = await request<{ shippingTaskOptions: ShippingTaskOptions }, Record<string, never>>(query, {});
  return response.shippingTaskOptions;
};

export const createShippingTask = async (input: CreateShippingTaskInput) => {
  const mutation = `mutation CreateShippingTask($input: CreateShippingTaskInput!) {
    createShippingTask(input: $input) { message task { ${TASK_FIELDS} } }
  }`;
  const response = await request<{ createShippingTask: { message: string; task: ShippingTask } }, { input: CreateShippingTaskInput }>(mutation, { input });
  return response.createShippingTask;
};

export const fetchShippingTasks = async (page: number, first: number, filter: ShippingTaskFilter) => {
  const query = `query ShippingTasks($page: Int!, $first: Int!, $filter: ShippingTaskFilterInput) {
    shippingTasks(page: $page, first: $first, filter: $filter) {
      data { ${TASK_FIELDS} }
      stats { total_tasks preparing in_transit completed cancelled }
      paginatorInfo { ${PAGINATOR_FIELDS} }
    }
  }`;
  const response = await request<{ shippingTasks: ShippingTaskPage }, { page: number; first: number; filter: ShippingTaskFilter }>(query, { page, first, filter });
  return response.shippingTasks;
};

export const fetchShippingTask = async (id: string) => {
  const query = `query ShippingTask($id: ID!) { shippingTask(id: $id) { ${TASK_FIELDS} } }`;
  const response = await request<{ shippingTask: ShippingTask }, { id: string }>(query, { id });
  return response.shippingTask;
};

export const updateShippingTaskStatus = async (id: string, status: string) => {
  const mutation = `mutation UpdateShippingTaskStatus($id: ID!, $status: String!) {
    updateShippingTaskStatus(id: $id, status: $status) { ${TASK_FIELDS} }
  }`;
  const response = await request<{ updateShippingTaskStatus: ShippingTask }, { id: string; status: string }>(mutation, { id, status });
  return response.updateShippingTaskStatus;
};

export const fetchExportSlips = async (page: number, first: number, filter: ExportSlipFilter) => {
  const query = `query ExportSlips($page: Int!, $first: Int!, $filter: ExportSlipFilterInput) {
    exportSlips(page: $page, first: $first, filter: $filter) {
      data { ${SLIP_FIELDS} }
      stats { total_slips total_packages total_weight total_value }
      paginatorInfo { ${PAGINATOR_FIELDS} }
    }
  }`;
  const response = await request<{ exportSlips: ExportSlipPage }, { page: number; first: number; filter: ExportSlipFilter }>(query, { page, first, filter });
  return response.exportSlips;
};

export const fetchExportSlip = async (id: string) => {
  const query = `query ExportSlip($id: ID!) {
    exportSlip(id: $id) {
      ${SLIP_FIELDS}
      customers { order_code name phone address }
      orders { id order_code customer_name package_count total_weight total_value }
      packages { id tracking_number order_id order_code customer_name customer_phone length width height weight value }
      service_type delivery_method transport_note
      payment { status paid_package_count total_package_count paid_at payment_method transaction_code bank_name confirmed_by paid_amount }
      financials { order_value shipping_fee cod_amount total_amount }
      history { id action from_status to_status actor_name created_at }
    }
  }`;
  const response = await request<{ exportSlip: ExportSlip }, { id: string }>(query, { id });
  return response.exportSlip;
};
