export const CN_PACKAGE_FIELDS = {
  list: `
    id
    warehouse_id
    order_id
    order_tracking_id
    receiver_name
    tracking_number
    declared_value
    carrier
    weight
    volume
    note
    status
    created_by
    received_at
    created_at
    warehouse {
      id
      code
      name
      address
      status
    }
    order {
      id
      order_code
      status
      customer {
        id
        name
        phone
        email
        address
      }
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
          seller
          shop_id
          shop_name
        }
      }
    }
    current_batch_package {
      id
      cn_batch_id
      batch {
        id
        batch_code
        status
        total_weight
        warehouse_id
        warehouse {
          id
          code
          name
        }
      }
    }
  `,
  detail: `
    id
    warehouse_id
    order_id
    order_tracking_id
    receiver_name
    tracking_number
    declared_value
    carrier
    weight
    volume
    note
    status
    created_by
    received_at
    created_at
    warehouse {
      id
      code
      name
      address
      status
    }
    order {
      id
      order_code
      status
      customer {
        id
        name
        phone
        email
        address
      }
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
          seller
          shop_id
          shop_name
        }
      }
    }
    current_batch_package {
      id
      cn_batch_id
      batch {
        id
        batch_code
        status
        total_weight
        warehouse_id
        warehouse {
          id
          code
          name
        }
      }
    }
  `,
  mutation: `
    id
    warehouse_id
    order_id
    order_tracking_id
    receiver_name
    tracking_number
    declared_value
    carrier
    weight
    volume
    note
    status
    created_by
    received_at
    created_at
    warehouse {
      id
      code
      name
      address
      status
    }
    order {
      id
      order_code
      status
      customer {
        id
        name
        phone
        email
        address
      }
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
          seller
          shop_id
          shop_name
        }
      }
    }
    current_batch_package {
      id
      cn_batch_id
      batch {
        id
        batch_code
        status
        total_weight
        warehouse_id
        warehouse {
          id
          code
          name
        }
      }
    }
  `,
} as const;

export const cnPackagesGraphql = {
  resource: "cnPackages",
  listQueryName: "cnPackages",
  detailQueryName: "cnPackage",
  fields: CN_PACKAGE_FIELDS,
  mutations: {
    create: {
      operationName: "createCnPackage",
      variableDefinitions: "$input: CreateCnPackageInput!",
      arguments: "input: $input",
      fields: CN_PACKAGE_FIELDS.mutation,
    },
    update: {
      operationName: "updateCnPackage",
      variableDefinitions: "$id: ID!, $input: UpdateCnPackageInput!",
      arguments: "id: $id, input: $input",
      fields: CN_PACKAGE_FIELDS.mutation,
    },
    deleteOne: {
      operationName: "deleteCnPackage",
      variableDefinitions: "$id: ID!",
      arguments: "id: $id",
      fields: "id",
    },
  },
} as const;
