import { ClientError } from "graphql-request";
import { client, syncGraphqlAuthToken } from "../../providers/graphqlClient";
import type { CustomerAddress, EligiblePaymentPackage, GhnDistrict, GhnProvince, GhnShippingQuote, GhnWard, PaymentAccount, PaymentVoucher, VoucherPreview, VoucherSurchargeInput } from "./types";

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
  receipt { warehouse { id name address } }
  cn_package { order { id order_code total_amount product_total_vnd deposit_percent deposit_amount_vnd deposit_paid_amount_vnd deposit_remaining_amount_vnd customer { id code name phone address province district ward } } }
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
const CUSTOMER_ADDRESS_FIELDS = `id customer_id label receiver_name receiver_phone province_code province_name district_code district_name ward_code ward_name address_line full_address is_default`;
const VOUCHER_FIELDS = `
  id
  voucher_code
  voucher_type
  order_id
  payment_method_expected
  payment_account_id
  bank_name_snapshot
  bank_code_snapshot
  bank_account_number_snapshot
  bank_account_holder_snapshot
  bank_branch_name_snapshot
  base_amount_cny
  exchange_rate
  base_amount_vnd
  deposit_percent
  currency
  transfer_content
  status
  subtotal
  discount_amount
  payment_method
  paid_at
  total_amount
  deposit_applied
  customer_credit_applied
  paid_amount
  remaining_amount
  note
  cancelled_reason
  created_at
  customer { id code name phone email address }
  order { id order_code status total_amount product_total_vnd deposit_percent deposit_amount_vnd deposit_paid_amount_vnd deposit_remaining_amount_vnd created_at }
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
    total_amount
    vnPackage { ${PACKAGE_FIELDS} }
  }
  items { id item_type description quantity unit_price amount reference_type reference_id created_at }
  deliveryRequest {
    id delivery_method preferred_carrier delivery_note status shipping_task_id
    address { id receiver_name receiver_phone province_code province_name district_code district_name ward_code ward_name address_line full_address }
    shipments { id carrier_code service_code carrier_order_id tracking_number shipping_fee cod_amount weight length width height status label_url }
  }
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

export const fetchGhnProvinces = async () => {
  const query = `query GhnProvinces { ghnProvinces { province_id name } }`;
  const res = await requestGraphql<{ ghnProvinces: GhnProvince[] }, Record<string, never>>(query, {});
  return res.ghnProvinces;
};

export const fetchCustomerAddresses = async (customerId: string) => {
  const query = `query CustomerAddresses($customer_id: ID!) { customerAddresses(customer_id: $customer_id) { ${CUSTOMER_ADDRESS_FIELDS} } }`;
  const res = await requestGraphql<{ customerAddresses: CustomerAddress[] }, { customer_id: string }>(query, { customer_id: customerId });
  return res.customerAddresses;
};

export type CustomerAddressInput = Omit<CustomerAddress, "id" | "full_address"> & { customer_id: string };

export const createCustomerAddress = async (input: CustomerAddressInput) => {
  const mutation = `mutation CreateCustomerAddress($input: CustomerAddressInput!) { createCustomerAddress(input: $input) { ${CUSTOMER_ADDRESS_FIELDS} } }`;
  const res = await requestGraphql<{ createCustomerAddress: CustomerAddress }, { input: CustomerAddressInput }>(mutation, { input });
  return res.createCustomerAddress;
};

export const updateCustomerAddress = async (id: string, input: CustomerAddressInput) => {
  const mutation = `mutation UpdateCustomerAddress($id: ID!, $input: CustomerAddressInput!) { updateCustomerAddress(id: $id, input: $input) { ${CUSTOMER_ADDRESS_FIELDS} } }`;
  const res = await requestGraphql<{ updateCustomerAddress: CustomerAddress }, { id: string; input: CustomerAddressInput }>(mutation, { id, input });
  return res.updateCustomerAddress;
};

export const setDefaultCustomerAddress = async (customerId: string, addressId: string) => {
  const mutation = `mutation SetDefaultCustomerAddress($customer_id: ID!, $address_id: ID!) { setDefaultCustomerAddress(customer_id: $customer_id, address_id: $address_id) { ${CUSTOMER_ADDRESS_FIELDS} } }`;
  const res = await requestGraphql<{ setDefaultCustomerAddress: CustomerAddress }, { customer_id: string; address_id: string }>(mutation, { customer_id: customerId, address_id: addressId });
  return res.setDefaultCustomerAddress;
};

export const fetchGhnDistricts = async (provinceId: number) => {
  if (!Number.isInteger(provinceId) || provinceId <= 0) {
    throw new Error("Mã Tỉnh/Thành phố GHN không hợp lệ. Vui lòng chọn lại.");
  }
  const query = `query GhnDistricts($province_id: Int!) { ghnDistricts(province_id: $province_id) { district_id province_id name } }`;
  const res = await requestGraphql<{ ghnDistricts: GhnDistrict[] }, { province_id: number }>(query, { province_id: provinceId });
  return res.ghnDistricts;
};

export const fetchGhnWards = async (districtId: number) => {
  if (!Number.isInteger(districtId) || districtId <= 0) {
    throw new Error("Mã Quận/Huyện GHN không hợp lệ. Vui lòng chọn lại.");
  }
  const query = `query GhnWards($district_id: Int!) { ghnWards(district_id: $district_id) { ward_code district_id name } }`;
  const res = await requestGraphql<{ ghnWards: GhnWard[] }, { district_id: number }>(query, { district_id: districtId });
  return res.ghnWards;
};

export const fetchGhnShippingQuote = async (input: {
  package_ids: string[];
  to_district_id: number;
  to_ward_code: string;
  insurance_value?: number;
  cod_amount?: number;
}) => {
  const query = `query GhnShippingQuote($input: GhnShippingQuoteInput!) { ghnShippingQuote(input: $input) { total service_fee insurance_fee service_id service_type_id service_name } }`;
  const res = await requestGraphql<{ ghnShippingQuote: GhnShippingQuote }, { input: typeof input }>(query, { input });
  return res.ghnShippingQuote;
};

export const previewPaymentVoucher = async (packageIds: string[], surcharges: VoucherSurchargeInput[], deliveryFee = 0) => {
  const query = `
    query PreviewPaymentVoucher($input: PreviewPaymentVoucherInput!) {
      previewPaymentVoucher(input: $input) {
        customer { id code name phone address }
        packages { id tracking_number order_id order_code customer_name actual_weight volumetric_weight chargeable_weight price_per_kg shipping_rate_id shipping_rate_detail_id unit_price price_type rate_description shipping_fee additional_charge_amount total_amount }
        order_total
        product_total
        weight_shipping_total
        delivery_fee_total
        additional_charge_total
        gross_total
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
  const res = await requestGraphql<{ previewPaymentVoucher: VoucherPreview }, { input: { package_ids: string[]; surcharges: VoucherSurchargeInput[]; delivery_fee: number } }>(query, {
    input: { package_ids: packageIds, surcharges, delivery_fee: deliveryFee },
  });
  return res.previewPaymentVoucher;
};

export const createPaymentVoucher = async (input: {
  package_ids: string[];
  request_uuid: string;
  vn_warehouse_id?: string;
  delivery_method: "pickup_at_warehouse" | "delivery";
  customer_address_id?: string;
  save_address?: boolean;
  set_address_default?: boolean;
  address_label?: string;
  receiver_name?: string;
  receiver_phone?: string;
  province_name?: string;
  district_name?: string;
  ward_name?: string;
  address_line?: string;
  full_address?: string;
  preferred_carrier?: string;
  province_code?: string;
  district_code?: string;
  ward_code?: string;
  delivery_note?: string;
  delivery_fee?: number;
  insurance_value?: number;
  cod_amount?: number;
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
        data { id voucher_code voucher_type status total_amount paid_amount remaining_amount created_at customer { id name phone } creator { id name } }
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
