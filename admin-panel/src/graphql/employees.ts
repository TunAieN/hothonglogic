export const EMPLOYEE_FIELDS = {
  list: `
    id
    name
    email
    role_id
    phone
    address
    birthday
    gender
    note
    department
    joined_at
    manager_id
    status
    created_at
    updated_at
    role {
      id
      key
      name
      description
      permissions
    }
    manager {
      id
      name
      role { id key name description }
    }
  `,
  detail: `
    id
    name
    email
    role_id
    phone
    address
    birthday
    gender
    note
    department
    joined_at
    manager_id
    status
    created_at
    updated_at
    role {
      id
      key
      name
      description
      permissions
    }
    manager {
      id
      name
      role { id key name description }
    }
  `,
  mutation: `
    id
    name
    email
    role_id
    phone
    address
    birthday
    gender
    note
    department
    joined_at
    manager_id
    status
    created_at
    updated_at
    role {
      id
      key
      name
      description
      permissions
    }
    manager {
      id
      name
      role { id key name description }
    }
  `,
} as const;

export const employeesGraphql = {
  resource: "employees",
  listQueryName: "employees",
  detailQueryName: "employee",
  fields: EMPLOYEE_FIELDS,
  mutations: {
    create: {
      operationName: "createEmployee",
      variableDefinitions: "$input: CreateEmployeeInput!",
      arguments: "input: $input",
      fields: EMPLOYEE_FIELDS.mutation,
    },
    update: {
      operationName: "updateEmployee",
      variableDefinitions: "$id: ID!, $input: UpdateEmployeeInput!",
      arguments: "id: $id, input: $input",
      fields: EMPLOYEE_FIELDS.mutation,
    },
    deleteOne: {
      operationName: "deleteEmployee",
      variableDefinitions: "$id: ID!",
      arguments: "id: $id",
      fields: EMPLOYEE_FIELDS.mutation,
    },
  },
} as const;

export const EMPLOYEE_DETAIL_SUPPORT_QUERY = `
  query EmployeeDetailSupport($employeeId: ID!) {
    employeeDetailStatistics(employee_id: $employeeId) {
      key
      label
      value
      suffix
    }
    employeeActivity(employee_id: $employeeId) {
      id
      action
      entity_type
      entity_id
      created_at
    }
    roles {
      id
      key
      name
      description
      permissions
    }
    employees(first: 100, filter: { status: "active" }) {
      data {
        id
        name
        role { id key name description }
      }
    }
  }
`;
