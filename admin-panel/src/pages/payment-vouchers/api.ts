import { ClientError } from "graphql-request";
import { client, syncGraphqlAuthToken } from "../../providers/graphqlClient";
import type { EligiblePaymentPackage, PaymentAccount, PaymentVoucher, VoucherPreview, VoucherSurchargeInput } from "./types";

const PACKAGE_FIELDS = `
  id
  tracking_number_snapshot
  actual_weight
  actual_length
  actual_width
  actual_height
  actual_volume
  inspection_status
  payment_status
  delivery_status
  received_at
  receipt { warehouse { id name } }
  cn_package { order { id order_code customer { id code name phone address } } }
`;

const PAYMENT_ACCOUNT_FIELDS = `
  id
  bank_name
  bank_code
  account_number
  account_holder
  branch_name
  is_default
  is_active
  note
`;
const VOUCHER_FIELDS = `
  id
  voucher_code
  receiver_type
  delivery_address
  payment_method_expected
  payment_account_id
  bank_name_snapshot
  bank_code_snapshot
  bank_account_number_snapshot
  bank_account_holder_snapshot
  bank_branch_name_snapshot
  transfer_content
  status
  shipping_fee_total
  domestic_shipping_fee
  surcharge_total
  total_amount
  deposit_applied
  customer_credit_applied
  paid_amount
  remaining_amount
  note
  cancelled_reason
  created_at
  customer { id code name phone address }
  warehouse { id name }
  creator { id name }
  paymentAccount { ${PAYMENT_ACCOUNT_FIELDS} }
  packages {
    id
    actual_weight
    volumetric_weight
    chargeable_weight
    price_per_kg
    shipping_rate_id
    shipping_rate_detail_id
    unit_price
    price_type
    rate_description
    shipping_fee
    surcharge_amount
    total_amount
    vnPackage { ${PACKAGE_FIELDS} }
  }
  surcharges { id surcharge_type amount note }
  transactions { id transaction_code amount payment_method bank_name bank_transaction_code received_at status note }
  invoice { id invoice_code issued_at total_amount paid_amount status items { id item_type description quantity unit_price amount } }
`;

const requestGraphql = async <TResult, TVariables extends Record<string, unknown>>(query: string, variables: TVariables) => {
  syncGraphqlAuthToken();
  return client.request<TResult>(query, variables as never);
};

export const getPaymentErrorMessage = (error: unknown) => {
  if (error instanceof ClientError) {
    const graphQLError = error.response.errors?.[0];
    const debugMessage = graphQLError?.extensions?.debugMessage;
    if (typeof debugMessage === "string" && debugMessage.trim()) {
      return debugMessage;
    }
    return graphQLError?.message ?? "Lỗi GraphQL.";
  }
  return error instanceof Error ? error.message : "Có lỗi không xác định.";
};

export const fetchEligiblePaymentPackages = async () => {
  const query = `
    query EligiblePaymentPackages($page: Int!, $first: Int!) {
      eligiblePaymentPackages(page: $page, first: $first) {
        data { ${PACKAGE_FIELDS} }
        paginatorInfo { total }
      }
    }
  `;
  const res = await requestGraphql<{ eligiblePaymentPackages: { data: EligiblePaymentPackage[] } }, { page: number; first: number }>(query, { page: 1, first: 200 });
  return res.eligiblePaymentPackages.data;
};

export const fetchDefaultPaymentAccount = async () => {
  const query = `
    query DefaultPaymentAccount {
      defaultPaymentAccount { ${PAYMENT_ACCOUNT_FIELDS} }
    }
  `;
  const res = await requestGraphql<{ defaultPaymentAccount: PaymentAccount | null }, Record<string, never>>(query, {});
  return res.defaultPaymentAccount;
};
export const previewPaymentVoucher = async (packageIds: string[], surcharges: VoucherSurchargeInput[]) => {
  const query = `
    query PreviewPaymentVoucher($input: PreviewPaymentVoucherInput!) {
      previewPaymentVoucher(input: $input) {
        customer { id code name phone address }
        packages { id tracking_number order_id order_code customer_name actual_weight volumetric_weight chargeable_weight price_per_kg shipping_rate_id shipping_rate_detail_id unit_price price_type rate_description shipping_fee domestic_shipping_fee surcharge_amount total_amount }
        shipping_fee_total
        domestic_shipping_fee
        surcharge_total
        deposit_applied
        customer_credit_available
        customer_credit_applied
        total_amount
        remaining_amount
        payment_account { ${PAYMENT_ACCOUNT_FIELDS} }
        transfer_content
      }
    }
  `;
  const res = await requestGraphql<{ previewPaymentVoucher: VoucherPreview }, { input: { package_ids: string[]; surcharges: VoucherSurchargeInput[] } }>(query, {
    input: { package_ids: packageIds, surcharges },
  });
  return res.previewPaymentVoucher;
};

export const createPaymentVoucher = async (input: {
  package_ids: string[];
  request_uuid: string;
  vn_warehouse_id?: string;
  receiver_type: string;
  delivery_address?: string;
  payment_method_expected: string;
  note?: string;
  surcharges: VoucherSurchargeInput[];
}) => {
  const mutation = `
    mutation CreatePaymentVoucher($input: CreatePaymentVoucherInput!) {
      createPaymentVoucher(input: $input) { ${VOUCHER_FIELDS} }
    }
  `;
  const res = await requestGraphql<{ createPaymentVoucher: PaymentVoucher }, { input: typeof input }>(mutation, { input });
  return res.createPaymentVoucher;
};

export const fetchPaymentVouchers = async (status?: string) => {
  const query = `
    query PaymentVouchers($page: Int!, $first: Int!, $filter: PaymentVoucherFilterInput) {
      paymentVouchers(page: $page, first: $first, filter: $filter) {
        data { id voucher_code status total_amount paid_amount remaining_amount created_at customer { id name phone } creator { id name } }
        paginatorInfo { total }
      }
    }
  `;
  const res = await requestGraphql<{ paymentVouchers: { data: PaymentVoucher[] } }, { page: number; first: number; filter?: { status: string } }>(query, {
    page: 1,
    first: 100,
    ...(status ? { filter: { status } } : {}),
  });
  return res.paymentVouchers.data;
};

export const fetchPaymentVoucher = async (id: string) => {
  const query = `query PaymentVoucher($id: ID!) { paymentVoucher(id: $id) { ${VOUCHER_FIELDS} } }`;
  const res = await requestGraphql<{ paymentVoucher: PaymentVoucher }, { id: string }>(query, { id });
  return res.paymentVoucher;
};

export const confirmPaymentTransaction = async (payment_voucher_id: string, input: {
  amount: number;
  payment_method: string;
  bank_name?: string;
  bank_transaction_code?: string;
  received_at?: string;
  note?: string;
}) => {
  const mutation = `mutation ConfirmPaymentTransaction($payment_voucher_id: ID!, $input: ConfirmPaymentTransactionInput!) { confirmPaymentTransaction(payment_voucher_id: $payment_voucher_id, input: $input) { ${VOUCHER_FIELDS} } }`;
  const res = await requestGraphql<{ confirmPaymentTransaction: PaymentVoucher }, { payment_voucher_id: string; input: typeof input }>(mutation, { payment_voucher_id, input });
  return res.confirmPaymentTransaction;
};

export const cancelPaymentVoucher = async (id: string, reason: string) => {
  const mutation = `mutation CancelPaymentVoucher($id: ID!, $reason: String!) { cancelPaymentVoucher(id: $id, reason: $reason) { ${VOUCHER_FIELDS} } }`;
  const res = await requestGraphql<{ cancelPaymentVoucher: PaymentVoucher }, { id: string; reason: string }>(mutation, { id, reason });
  return res.cancelPaymentVoucher;
};