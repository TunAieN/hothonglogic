export const ORDER_FIELDS = {
  list: `
    id
    order_code
    status
    total_amount
    created_at
    creator {
      id
      name
    }
    customer {
      id
      name
      email
    }
  `,
  detail: `
    id
    order_code
    status
    total_amount
    created_at
    creator {
      id
      name
    }
    customer {
      id
      code
      name
      phone
      email
      address
    }
    items {
      id
      product_name
      product_link
      price_cny
      quantity
      note
      product_image
    }
  `,
  mutation: `
    id
    order_code
    status
    total_amount
    created_at
    creator {
      id
      name
    }
    customer {
      id
      code
      name
      phone
      email
      address
    }
    items {
      id
      product_name
      product_link
      price_cny
      quantity
      note
      product_image
    }
  `,
} as const;

export const ordersGraphql = {
  resource: "orders",
  listQueryName: "orders",
  detailQueryName: "order",
  fields: ORDER_FIELDS,
  mutations: {
    create: {
      operationName: "createOrder",
      variableDefinitions: "$input: CreateOrderInput!",
      arguments: "input: $input",
      fields: ORDER_FIELDS.mutation,
    },
    update: {
      operationName: "updateOrder",
      variableDefinitions: "$id: ID!, $input: UpdateOrderInput!",
      arguments: "id: $id, input: $input",
      fields: ORDER_FIELDS.mutation,
    },
    deleteOne: {
      operationName: "deleteOrder",
      variableDefinitions: "$id: ID!",
      arguments: "id: $id",
      fields: "id",
    },
  },
} as const;
