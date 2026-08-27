export const CN_BATCH_FIELDS = {
  list: `
    id
    batch_code
    warehouse_id
    destination_warehouse_name
    total_packages
    status
    shipping_type
    packaging_type
    transport_container_count
    departed_at
    expected_arrival_at
    arrived_at
    total_weight
    actual_batch_weight
    package_material_weight
    actual_length
    actual_width
    actual_height
    actual_volume
    carrier_name
    transport_code
    route_name
    vehicle_plate
    driver_name
    driver_phone
    freight_cost
    handed_over_by
    handed_over_at
    dispatch_note
    note
    created_at
    updated_at
    warehouse {
      id
      code
      name
      address
      status
    }
    packages {
      id
      warehouse_id
      order_id
      order_tracking_id
      receiver_name
      tracking_number
      weight
      actual_length
      actual_width
      actual_height
      volume
      status
      note
      received_at
      created_at
      package_items {
        id
        order_item_id
        quantity
        order_item {
          id
          product_name
          size
          color
        }
      }
      order {
        id
        order_code
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
      }
    }
  `,
  detail: `
    id
    batch_code
    warehouse_id
    destination_warehouse_name
    total_packages
    status
    shipping_type
    packaging_type
    transport_container_count
    departed_at
    expected_arrival_at
    arrived_at
    total_weight
    actual_batch_weight
    package_material_weight
    actual_length
    actual_width
    actual_height
    actual_volume
    carrier_name
    transport_code
    route_name
    vehicle_plate
    driver_name
    driver_phone
    freight_cost
    handed_over_by
    handed_over_at
    dispatch_note
    note
    created_at
    updated_at
    warehouse {
      id
      code
      name
      address
      status
    }
    packages {
      id
      warehouse_id
      order_id
      order_tracking_id
      receiver_name
      tracking_number
      weight
      actual_length
      actual_width
      actual_height
      volume
      status
      note
      received_at
      created_at
      package_items {
        id
        order_item_id
        quantity
        order_item {
          id
          product_name
          size
          color
        }
      }
      order {
        id
        order_code
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
      }
    }
  `,
  mutation: `
    id
    batch_code
    warehouse_id
    destination_warehouse_name
    total_packages
    status
    shipping_type
    packaging_type
    transport_container_count
    departed_at
    expected_arrival_at
    arrived_at
    total_weight
    actual_batch_weight
    package_material_weight
    actual_length
    actual_width
    actual_height
    actual_volume
    carrier_name
    transport_code
    route_name
    vehicle_plate
    driver_name
    driver_phone
    freight_cost
    handed_over_by
    handed_over_at
    dispatch_note
    note
    created_at
    updated_at
    warehouse {
      id
      code
      name
      address
      status
    }
    packages {
      id
      warehouse_id
      order_id
      order_tracking_id
      receiver_name
      tracking_number
      weight
      actual_length
      actual_width
      actual_height
      volume
      status
      note
      received_at
      created_at
      package_items {
        id
        order_item_id
        quantity
        order_item {
          id
          product_name
          size
          color
        }
      }
      order {
        id
        order_code
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
      }
    }
  `,
} as const;

export const cnBatchesGraphql = {
  resource: "cnBatches",
  listQueryName: "cnBatches",
  detailQueryName: "cnBatch",
  fields: CN_BATCH_FIELDS,
  mutations: {
    update: {
      operationName: "updateCnBatch",
      variableDefinitions: "$id: ID!, $input: UpdateCnBatchInput!",
      arguments: "id: $id, input: $input",
      fields: CN_BATCH_FIELDS.mutation,
    },
    deleteOne: {
      operationName: "deleteCnBatch",
      variableDefinitions: "$id: ID!",
      arguments: "id: $id",
      fields: "id",
    },
  },
} as const;
