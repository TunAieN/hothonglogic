export const ORDER_FIELDS = {
  list: `
    id
    order_code
    status
    total_amount
    note
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
    customer_id
    status
    total_amount
    note
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
    order_trackings {
      id
      tracking_number
      carrier
      declared_value
      status
      tracking_items {
        id
        order_item_id
        quantity
        order_item {
          id
          product_name
          price_cny
          quantity
          seller
          shop_id
          shop_name
        }
      }
    }
    cn_packages {
      id
      warehouse_id
      order_id
      order_tracking_id
      tracking_number
      declared_value
      carrier
      weight
      volume
      status
      note
      received_at
      created_at
      warehouse {
        id
        code
        name
        address
      }
      order_tracking {
        id
        tracking_number
        carrier
        declared_value
        status
        tracking_items {
          id
          order_item_id
          quantity
          order_item {
            id
            product_name
            price_cny
            quantity
            seller
            shop_id
            shop_name
          }
        }
      }
      package_items {
        id
        cn_package_id
        order_item_id
        quantity
        order_item {
          id
          product_name
          price_cny
          quantity
          seller
          shop_id
          shop_name
        }
      }
    }
    items {
      id
      product_name
      product_link
      price_cny
      quantity
      note
      product_image
      seller
      shop_id
      shop_name
      size
      color
    }
  `,
  mutation: `
    id
    order_code
    customer_id
    status
    total_amount
    note
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
    cn_packages {
      id
      warehouse_id
      order_id
      order_tracking_id
      tracking_number
      declared_value
      carrier
      weight
      volume
      status
      note
      received_at
      created_at
      warehouse {
        id
        code
        name
        address
      }
      order_tracking {
        id
        tracking_number
        carrier
        declared_value
        status
        tracking_items {
          id
          order_item_id
          quantity
          order_item {
            id
            product_name
            price_cny
            quantity
            seller
            shop_id
            shop_name
          }
        }
      }
      package_items {
        id
        cn_package_id
        order_item_id
        quantity
        order_item {
          id
          product_name
          price_cny
          quantity
          seller
          shop_id
          shop_name
        }
      }
    }
    items {
      id
      product_name
      product_link
      price_cny
      quantity
      note
      product_image
      seller
      shop_id
      shop_name
      size
      color
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
