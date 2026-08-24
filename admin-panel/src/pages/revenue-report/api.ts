import { client, getGraphqlAuthHeaders, syncGraphqlAuthToken } from "../../providers/graphqlClient";

export type RevenueGroupBy = "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";

export type RevenueReportInput = {
  warehouseId?: string | null;
  dateFrom: string;
  dateTo: string;
  groupBy: RevenueGroupBy;
  revenueType?: string | null;
  detailPage?: number;
  detailPageSize?: number;
  detailSortField?: string;
  detailSortDirection?: "asc" | "desc";
};

export type RevenueMetric = {
  current: number | null;
  previous: number | null;
  changePercent: number | null;
};

export type RevenueReport = {
  summary: {
    revenue: RevenueMetric;
    paid: RevenueMetric;
    cost: RevenueMetric;
    profit: RevenueMetric;
    orders: RevenueMetric;
    paidRate: number | null;
    dateFrom: string;
    dateTo: string;
    previousDateFrom: string;
    previousDateTo: string;
  };
  timeline: Array<{
    periodKey: string;
    label: string;
    revenue: number;
    previousRevenue: number;
    changePercent: number | null;
  }>;
  warehouses: Array<{
    warehouseId: string;
    warehouseName: string;
    revenue: number;
    percent: number;
  }>;
  services: Array<{
    serviceType: string;
    serviceName: string;
    revenue: number;
    percent: number;
  }>;
  details: RevenueDetailRow[];
  detailPagination: {
    currentPage: number;
    perPage: number;
    total: number;
    lastPage: number;
  };
  notes: string[];
};

export type RevenueDetailRow = {
  periodKey: string;
  label: string;
  orderCount: number;
  revenue: number;
  paid: number;
  shippingFee?: number | null;
  domesticShippingFee?: number | null;
  surcharge?: number | null;
  discount?: number | null;
  cost?: number | null;
  profit?: number | null;
};

export type RevenueDrilldownItem = {
  invoiceId: string;
  invoiceCode: string;
  voucherCode?: string | null;
  orderId?: string | null;
  orderCode?: string | null;
  customerName?: string | null;
  issuedAt?: string | null;
  revenue: number;
  paid: number;
};

export type VnWarehouseOption = {
  id: string;
  code: string;
  name: string;
  address?: string | null;
};

const REPORT_FIELDS = `
  summary {
    revenue { current previous changePercent }
    paid { current previous changePercent }
    cost { current previous changePercent }
    profit { current previous changePercent }
    orders { current previous changePercent }
    paidRate
    dateFrom
    dateTo
    previousDateFrom
    previousDateTo
  }
  timeline { periodKey label revenue previousRevenue changePercent }
  warehouses { warehouseId warehouseName revenue percent }
  services { serviceType serviceName revenue percent }
  details {
    periodKey
    label
    orderCount
    revenue
    paid
    shippingFee
    domesticShippingFee
    surcharge
    discount
    cost
    profit
  }
  detailPagination { currentPage perPage total lastPage }
  notes
`;

const requestGraphql = async <TResult, TVariables extends Record<string, unknown>>(query: string, variables: TVariables) => {
  syncGraphqlAuthToken();
  return client.request<TResult>(query, variables, getGraphqlAuthHeaders());
};

const toGraphqlDateTime = (value: string, boundary: "start" | "end") => {
  const trimmedValue = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  return `${trimmedValue} ${boundary === "start" ? "00:00:00" : "23:59:59"}`;
};

const normalizeRevenueReportInput = (input: RevenueReportInput): RevenueReportInput => ({
  ...input,
  dateFrom: toGraphqlDateTime(input.dateFrom, "start"),
  dateTo: toGraphqlDateTime(input.dateTo, "end"),
});

export const fetchRevenueReport = async (input: RevenueReportInput) => {
  const query = `
    query RevenueReport($input: RevenueReportInput!) {
      revenueReport(input: $input) {
        ${REPORT_FIELDS}
      }
    }
  `;
  const response = await requestGraphql<{ revenueReport: RevenueReport }, { input: RevenueReportInput }>(query, {
    input: normalizeRevenueReportInput(input),
  });
  return response.revenueReport;
};

export const fetchRevenueReportDrilldown = async (input: RevenueReportInput, periodKey: string) => {
  const query = `
    query RevenueReportDrilldown($input: RevenueReportInput!, $periodKey: String!) {
      revenueReportDrilldown(input: $input, periodKey: $periodKey) {
        invoiceId
        invoiceCode
        voucherCode
        orderId
        orderCode
        customerName
        issuedAt
        revenue
        paid
      }
    }
  `;
  const response = await requestGraphql<
    { revenueReportDrilldown: RevenueDrilldownItem[] },
    { input: RevenueReportInput; periodKey: string }
  >(query, { input: normalizeRevenueReportInput(input), periodKey });
  return response.revenueReportDrilldown;
};

export const fetchVnWarehouses = async () => {
  const query = `
    query VnWarehouses {
      vnWarehouses { id code name address }
    }
  `;
  const response = await requestGraphql<{ vnWarehouses: VnWarehouseOption[] }, Record<string, never>>(query, {});
  return response.vnWarehouses;
};
