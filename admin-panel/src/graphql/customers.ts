export const CUSTOMER_FIELDS = {
  list: `
    id
    code
    name
    phone
    email
    address
    status
    created_at
    orders_count
  `,
  detail: `
    id
    code
    name
    phone
    email
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
      created_at
    }
  `,
  mutation: `
    id
    code
    name
    phone
    email
    address
    note
    status
    created_at
    orders_count
  `,
} as const;

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
