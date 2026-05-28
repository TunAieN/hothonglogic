export const USER_FIELDS = {
  list: `
    id
    name
    email
  `,
  detail: `
    id
    name
    email
  `,
  mutation: `
    id
    name
    email
  `,
} as const;

export const usersGraphql = {
  resource: "users",
  listQueryName: "users",
  detailQueryName: "user",
  fields: USER_FIELDS,
  mutations: {},
} as const;
