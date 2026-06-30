export const EMPLOYEE_FIELDS = {
  list: `
    id
    name
    email
    role_id
    phone
    address
    status
    created_at
    updated_at
    role {
      id
      name
      permissions
    }
  `,
  detail: `
    id
    name
    email
    role_id
    phone
    address
    status
    created_at
    updated_at
    role {
      id
      name
      permissions
    }
  `,
  mutation: `
    id
    name
    email
    role_id
    phone
    address
    status
    created_at
    updated_at
    role {
      id
      name
      permissions
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