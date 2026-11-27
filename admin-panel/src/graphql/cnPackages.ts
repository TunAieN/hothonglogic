export const CN_PACKAGE_FIELDS = {
  list: `
    id
    warehouse_id
    order_id
    order_tracking_id
    receiver_name
    receiver_user_id
    tracking_number
    declared_value
    carrier
    weight
    actual_length
    actual_width
    actual_height
    volume
    volumetric_weight
    chargeable_weight
    note
    status
    package_condition
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
    receiver { id name email phone role { id key name description permissions } }
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
      items {
        id
        product_name
        product_image
        price_cny
        quantity
        seller
        shop_id
        shop_name
        size
        color
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
        size
        color
      }
    }
  `,
  detail: `
    id
    warehouse_id
    order_id
    order_tracking_id
    receiver_name
    receiver_user_id
    tracking_number
    declared_value
    carrier
    weight
    actual_length
    actual_width
    actual_height
    volume
    volumetric_weight
    chargeable_weight
    note
    status
    package_condition
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
    receiver { id name email phone role { id key name description permissions } }
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
      items {
        id
        product_name
        product_image
        price_cny
        quantity
        seller
        shop_id
        shop_name
        size
        color
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
        size
        color
      }
    }
  `,
  mutation: `
    id
    warehouse_id
    order_id
    order_tracking_id
    receiver_name
    receiver_user_id
    tracking_number
    declared_value
    carrier
    weight
    actual_length
    actual_width
    actual_height
    volume
    volumetric_weight
    chargeable_weight
    note
    status
    package_condition
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
    receiver { id name email phone role { id key name description permissions } }
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
      items {
        id
        product_name
        product_image
        price_cny
        quantity
        seller
        shop_id
        shop_name
        size
        color
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
        size
        color
      }
    }
  `,
} as const;

export const CN_RECEIVING_OPTIONS_QUERY = `
  query CnReceivingOptions {
    cnReceivingOptions {
      warehouses { id code name address status }
      receivers {
        id name email phone department status
        role { id key name description permissions }
      }
    }
  }
`;

export const CN_PACKAGE_TRACKING_VALIDATION_QUERY = `
  query CnPackageTrackingValidation($trackingNumber: String!, $ignorePackageId: ID) {
    cnPackageTrackingValidation(
      tracking_number: $trackingNumber
      ignore_package_id: $ignorePackageId
    ) {
      valid
      message
      code
      matched
      existing_package_id
      order_code
      purchase_orders { id external_order_code shop_name }
    }
  }
`;

export const CN_PACKAGE_RECONCILIATION_ORDERS_QUERY = `
  query CnPackageReconciliationOrders($search: String!) {
    cnPackageReconciliationOrders(search: $search) {
      id order_code customer_name tracking_numbers
      purchases { id external_order_code shop_name }
    }
  }
`;

export const CN_EXPECTED_INBOUND_QUERY = `
  query CnExpectedInboundTrackings(
    $filter: CnExpectedInboundFilterInput
    $first: Int!
    $page: Int!
  ) {
    cnExpectedInboundTrackings(filter: $filter, first: $first, page: $page) {
      data {
        id
        tracking_number
        display_status
        can_receive
        order {
          id
          order_code
          customer { id code name }
        }
        purchase_orders { id external_order_code shop_name }
        products { id name image sku quantity }
        product_summary { allocated sku_count total_quantity }
        warehouse { id code name status }
      }
      paginatorInfo {
        currentPage
        lastPage
        perPage
        total
        firstItem
        lastItem
        hasMorePages
      }
      summary { tracking_count order_count customer_count }
      shops
    }
  }
`;

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

export const RECEIVE_CN_PACKAGE_MUTATION = `
  mutation ReceiveCnPackage($input: CreateCnPackageInput!) {
    createCnPackage(input: $input) { id }
  }
`;
