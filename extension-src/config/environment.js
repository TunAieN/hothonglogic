export const ACTIVE_EXTENSION_ENVIRONMENT = "development";

const ENVIRONMENTS = Object.freeze({
  development: Object.freeze({
    graphqlEndpoint: "http://127.0.0.1:8000/graphql",
    adminOrderUrl: "http://localhost:5173/orders/external/create",
  }),
  production: Object.freeze({
    graphqlEndpoint: "https://api.example.invalid/graphql",
    adminOrderUrl: "https://admin.example.invalid/orders/external/create",
  }),
});

export const getEnvironmentConfig = (environment = ACTIVE_EXTENSION_ENVIRONMENT) => {
  const config = ENVIRONMENTS[environment];

  if (!config) {
    throw new Error(`Unsupported extension environment: ${environment}`);
  }

  return config;
};
