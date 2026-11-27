import { useEffect, useMemo, useState } from "react";
import { client, getGraphqlAuthHeaders, syncGraphqlAuthToken } from "../../providers/graphqlClient";
import { mapApiBatchToViewModel } from "./helpers";
import type { BatchApiRecord, BatchDispatchReview } from "./types";

const query = `query CnBatchWorkspace($id: ID!) {
  cnBatch(id: $id) {
    id batch_code warehouse_id status shipping_type created_at note departed_at expected_arrival_at arrived_at
    total_packages total_weight transport_container_count actual_batch_weight handed_over_at carrier_name transport_code dispatch_note
    destination_warehouse_id destination_warehouse_name destination_warehouse { id name }
    warehouse { id name }
    packages {
      id warehouse_id tracking_number receiver_name weight volume status received_at package_condition
      order { order_code }
      package_items { id order_item_id quantity order_item { id product_name color size } }
    }
  }
  cnBatchDispatchReview(id: $id) { version destination_ready issues packages { id issues warnings } destinations { id code name } }
}`;

export function useBatchWorkspace(id: string) {
  const [generation, setGeneration] = useState(0);
  const [result, setResult] = useState<{ key: string; batch?: BatchApiRecord; review?: BatchDispatchReview }>();
  const key = `${id}:${generation}`;
  useEffect(() => {
    const request = new AbortController();
    syncGraphqlAuthToken();
    void client.request<{ cnBatch: BatchApiRecord | null; cnBatchDispatchReview: BatchDispatchReview | null }>({
      document: query, variables: { id }, requestHeaders: getGraphqlAuthHeaders(),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]),
    }).then((data) => {
      if (!request.signal.aborted) setResult({ key, batch: data.cnBatch ?? undefined, review: data.cnBatchDispatchReview ?? undefined });
    }).catch(() => {
      if (!request.signal.aborted) setResult({ key });
    });
    return () => request.abort();
  }, [id, key]);
  const latest = result?.key === key ? result : undefined;
  const batch = useMemo(() => latest?.batch && latest.review ? mapApiBatchToViewModel(latest.batch) : undefined, [latest]);
  return { batch, review: latest?.review, loading: !latest, error: Boolean(latest && !batch),
    reload: () => setGeneration((value) => value + 1) };
}
