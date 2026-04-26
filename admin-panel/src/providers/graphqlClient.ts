import { GraphQLClient } from "graphql-request";

export const GRAPHQL_API_URL = "http://127.0.0.1:8000/graphql";

export const client = new GraphQLClient(
  GRAPHQL_API_URL,
  {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
    },
  }
);
