export class GraphQLRequestError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = "GraphQLRequestError";
    this.errors = errors;
  }
}

export async function graphqlRequest({ endpoint, query, variables, token }) {
  const headers = { "Content-Type": "application/json" };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();

  if (!response.ok || payload.errors?.length) {
    throw new GraphQLRequestError(
      payload.errors?.[0]?.message || `GraphQL request failed (${response.status})`,
      payload.errors || [],
    );
  }

  return payload.data;
}
