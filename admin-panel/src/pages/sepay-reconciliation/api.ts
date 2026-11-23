import { client, syncGraphqlAuthToken } from "../../providers/graphqlClient";

export type SepayEvent = {
  id: string;
  provider_transaction_id: string;
  payment_intent_id?: string | null;
  transfer_type?: string | null;
  bank_code?: string | null;
  account_number?: string | null;
  amount_vnd?: number | null;
  reference?: string | null;
  status: string;
  reconciliation_reason?: string | null;
  attempt_count: number;
  last_attempt_at?: string | null;
  next_retry_at?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  processing_history_json: string;
  occurred_at?: string | null;
  processed_at?: string | null;
  created_at: string;
  intent?: { id: string; customer_id: string; payment_voucher_id?: string | null; reference: string; status: string } | null;
};

const fields = `id provider_transaction_id payment_intent_id transfer_type bank_code account_number amount_vnd reference status reconciliation_reason attempt_count last_attempt_at next_retry_at last_error_code last_error_message processing_history_json occurred_at processed_at created_at intent { id customer_id payment_voucher_id reference status }`;

export async function fetchSepayEvents(filter: Record<string, string>, page = 1) {
  syncGraphqlAuthToken();
  const query = `query SepayEvents($page: Int!, $first: Int!, $filter: SepayWebhookEventFilterInput) { sepayWebhookEvents(page: $page, first: $first, filter: $filter) { data { ${fields} } paginatorInfo { currentPage lastPage total } } }`;
  const result = await client.request<{ sepayWebhookEvents: { data: SepayEvent[]; paginatorInfo: { currentPage: number; lastPage: number; total: number } } }>(query, { page, first: 20, filter });
  return result.sepayWebhookEvents;
}

export async function retrySepayEvent(id: string) {
  syncGraphqlAuthToken();
  const mutation = `mutation RetrySepayEvent($id: ID!) { retrySepayWebhookEvent(id: $id) { ${fields} } }`;
  const result = await client.request<{ retrySepayWebhookEvent: SepayEvent }>(mutation, { id });
  return result.retrySepayWebhookEvent;
}
