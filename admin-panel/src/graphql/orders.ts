export const ORDER_FIELDS = {
  list: `
    id
    order_code
    creation_source
    submitted_at
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
    note
    created_at
    creator {
      id
      name
    }
    accountManager {
      id
      name
    }
    customer {
      id
      name
      email
      vip_group
      vip_qualified_spend_vnd
      vipTier { id code name base_deposit_percent credit_limit_vnd deposit_policy_enabled }
    }
  `,
  detail: `
    id
    order_code
    customer_id
    creation_source
    submitted_at
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
    depositVoucher {
      id
      voucher_code
      voucher_type
      status
      currency
      base_amount_cny
      exchange_rate
      base_amount_vnd
      deposit_percent
      total_amount
      paid_amount
      remaining_amount
      bank_name_snapshot
      bank_account_number_snapshot
      bank_account_holder_snapshot
      bank_branch_name_snapshot
      transfer_content
      created_at
      transactions {
        id
        transaction_code
        amount
        payment_method
        bank_name
        bank_transaction_code
        received_at
        confirmed_by
        confirmation_source
        provider
        provider_transaction_id
        status
        note
        created_at
      }
      invoice {
        id
        invoice_code
        invoice_type
        status
        total_amount
        paid_amount
        issued_at
      }
      paymentAutomation {
        enabled
        intent { reference amount_vnd status display_status expires_at created_at completed_at qr_url bank_name bank_code account_number account_holder }
        latest_event { provider_transaction_id status reconciliation_reason amount_vnd occurred_at processed_at }
        notifications { id type channel status title body sent_by sent_at read_at created_at }
      }
    }
    depositPolicySnapshot {
      id vip_code vip_name qualified_spend_vnd vip_deposit_percent risk_code risk_name risk_reason
      risk_minimum_percent capital_minimum_percent base_amount_vnd recommended_percent final_percent
      deposit_waived is_exception exception_reason assessed_by approved_by assessed_at approved_at voucher_issued_at
    }
    note
    created_at
    creator {
      id
      name
    }
    accountManager {
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
      vip_group
      vip_qualified_spend_vnd
      vipTier { id code name base_deposit_percent credit_limit_vnd deposit_policy_enabled }
    }
    deliveryRequest {
      id
      delivery_note
      address { source_customer_address_id receiver_name receiver_phone country_code country_name province_code province_name district_code district_name ward_code ward_name address_line full_address }
    }
    order_trackings {
      id
      tracking_number
      carrier
      declared_value
      dispatched_at
      note
      status
      taobao_purchase_orders { id external_order_code shop_name }
      tracking_items {
        id
        order_item_id
        quantity
        order_item {
          id
          product_name
          product_image
          price_cny
          exchange_rate
          unit_price_vnd
          quantity
          subtotal_cny
          subtotal_vnd
          seller
          shop_id
          shop_name
          size
          color
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
        dispatched_at
        note
        status
        tracking_items {
          id
          order_item_id
          quantity
          order_item {
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
          exchange_rate
          unit_price_vnd
          quantity
          subtotal_cny
          subtotal_vnd
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
      exchange_rate
      unit_price_vnd
      quantity
      subtotal_cny
      subtotal_vnd
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
    creation_source
    submitted_at
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
    depositVoucher {
      id
      voucher_code
      voucher_type
      status
      currency
      base_amount_cny
      exchange_rate
      base_amount_vnd
      deposit_percent
      total_amount
      paid_amount
      remaining_amount
      bank_name_snapshot
      bank_account_number_snapshot
      bank_account_holder_snapshot
      bank_branch_name_snapshot
      transfer_content
      created_at
      transactions {
        id
        transaction_code
        amount
        payment_method
        bank_name
        bank_transaction_code
        received_at
        confirmed_by
        confirmation_source
        provider
        provider_transaction_id
        status
        note
        created_at
      }
      invoice {
        id
        invoice_code
        invoice_type
        status
        total_amount
        paid_amount
        issued_at
      }
      paymentAutomation {
        enabled
        intent { reference amount_vnd status display_status expires_at created_at completed_at qr_url bank_name bank_code account_number account_holder }
        latest_event { provider_transaction_id status reconciliation_reason amount_vnd occurred_at processed_at }
        notifications { id type channel status title body sent_by sent_at read_at created_at }
      }
    }
    depositPolicySnapshot {
      id vip_code vip_name qualified_spend_vnd vip_deposit_percent risk_code risk_name risk_reason
      risk_minimum_percent capital_minimum_percent base_amount_vnd recommended_percent final_percent
      deposit_waived is_exception exception_reason assessed_by approved_by assessed_at approved_at voucher_issued_at
    }
    note
    created_at
    creator {
      id
      name
    }
    accountManager {
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
      vip_group
      vip_qualified_spend_vnd
      vipTier { id code name base_deposit_percent credit_limit_vnd deposit_policy_enabled }
    }
    deliveryRequest {
      id
      delivery_note
      address { source_customer_address_id receiver_name receiver_phone country_code country_name province_code province_name district_code district_name ward_code ward_name address_line full_address }
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
        dispatched_at
        note
        status
        tracking_items {
          id
          order_item_id
          quantity
          order_item {
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
          exchange_rate
          unit_price_vnd
          quantity
          subtotal_cny
          subtotal_vnd
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
      exchange_rate
      unit_price_vnd
      quantity
      subtotal_cny
      subtotal_vnd
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
