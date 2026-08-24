export const CUSTOMER_FIELDS = {
  list: `
    id
    code
    name
    vip_group
    phone
    email
    province
    district
    ward
    address
    note
    status
    created_at
    orders_count
  `,
  detail: `
    id
    code
    name
    vip_group
    phone
    email
    province
    district
    ward
    address
    note
    status
    created_at
    orders_count
    orders {
      id
      order_code
      status
      total_amount
      exchange_rate
      product_total_cny
      product_total_vnd
      currency
      exchange_rate_locked_at
    deposit_percent
    deposit_amount_vnd
    deposit_paid_amount_vnd
    deposit_remaining_amount_vnd
    deposit_status
    deposit_transfer_content
    deposit_requested_at
    deposit_paid_at
      created_at
    }
  `,
  mutation: `
    id
    code
    name
    vip_group
    phone
    email
    province
    district
    ward
    address
    note
    status
    created_at
    orders_count
  `,
} as const;

export const CUSTOMER_OPTION_FIELDS = `
  id
  code
  name
  phone
` as const;

export const customersGraphql = {
  resource: "customers",
  listQueryName: "customers",
  detailQueryName: "customer",
  fields: CUSTOMER_FIELDS,
  mutations: {
    create: {
      operationName: "createCustomer",
      variableDefinitions: "$input: CreateCustomerInput!",
      arguments: "input: $input",
      fields: CUSTOMER_FIELDS.mutation,
    },
    update: {
      operationName: "updateCustomer",
      variableDefinitions: "$id: ID!, $input: UpdateCustomerInput!",
      arguments: "id: $id, input: $input",
      fields: CUSTOMER_FIELDS.mutation,
    },
    deleteOne: {
      operationName: "deleteCustomer",
      variableDefinitions: "$id: ID!",
      arguments: "id: $id",
      fields: "id",
    },
  },
} as const;
