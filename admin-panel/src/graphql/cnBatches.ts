export const CN_BATCH_FIELDS = {
  list: `
    id
    batch_code
    warehouse_id
    destination_warehouse_name
    total_packages
    status
    shipping_type
    departed_at
    expected_arrival_at
    arrived_at
    total_weight
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
      volume
      status
      note
      received_at
      created_at
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
    departed_at
    expected_arrival_at
    arrived_at
    total_weight
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
      volume
      status
      note
      received_at
      created_at
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
    departed_at
    expected_arrival_at
    arrived_at
    total_weight
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
      volume
      status
      note
      received_at
      created_at
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
