import { useEffect, useState } from "react";
import { client, getGraphqlAuthHeaders, syncGraphqlAuthToken } from "../../../providers/graphqlClient";
import type { ChinaWarehousePackage } from "../types";
import type { ItemQuantity } from "./packageInspectionSave";

export type Purchase = {
  id: string;
  code: string;
  shop?: string | null;
  items: { order_item_id: string; name?: string | null; variant: string; quantity: number }[];
};

type Review = {
  quantities: { order_item_id: string; checked_elsewhere: number; remaining: number }[];
  status: "no_items" | "linked" | "conflict" | "candidates" | "no_purchase_data" | "unknown";
  ambiguous: boolean;
  purchase_ids: string[];
  candidates: Purchase[];
  linked_purchases: Purchase[];
};

const reviewQuery = `query CnPackageInspectionReview($id: ID!, $items: [OrderPackageItemInput!]) {
  cnPackageInspectionReview(package_id: $id, items: $items) {
    quantities { order_item_id checked_elsewhere remaining }
    status ambiguous purchase_ids
    candidates { ...InspectionPurchase }
    linked_purchases { ...InspectionPurchase }
  }
}
fragment InspectionPurchase on CnTrackingPurchaseOption {
  id code shop items { order_item_id name variant quantity }
}`;

export const useTrackingPurchaseVerification = (record: ChinaWarehousePackage, items: ItemQuantity[] | null, canVerify: boolean) => {
  const [result, setResult] = useState<{ key: string; data?: Review }>();
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [request, setRequest] = useState(0);
  const itemsJson = JSON.stringify(items);
  const key = JSON.stringify([record.id, itemsJson, request]);
  const data = result?.key === key ? result.data : undefined;
  const loading = result?.key !== key;
  const loadError = !loading && !data;
  const retry = () => setRequest((value) => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      syncGraphqlAuthToken();
      void client.request<{ cnPackageInspectionReview: Review }>({
        document: reviewQuery, variables: { id: record.id, items: JSON.parse(itemsJson) },
        requestHeaders: getGraphqlAuthHeaders(), signal: controller.signal,
      }).then(({ cnPackageInspectionReview }) => {
        if (!controller.signal.aborted) setResult({ key, data: cnPackageInspectionReview });
      }).catch(() => {
        if (!controller.signal.aborted) setResult({ key });
      });
    }, 200);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [itemsJson, key, record.id]);

  const canSave = canVerify && Boolean(data && reason.trim() && selected.length
    && selected.every((id) => data.candidates.some((purchase) => purchase.id === id)));

  const save = async () => {
    if (!canSave || !data) throw new Error("Hãy rà lại đơn mua và căn cứ xác minh.");
    try {
      syncGraphqlAuthToken();
      await client.request(`mutation VerifyCnTrackingPurchases($input: CnTrackingPurchaseVerificationInput!) {
        verifyCnTrackingPurchases(input: $input) { purchase_ids }
      }`, { input: {
        package_id: record.id, tracking_id: record.orderTrackingId, add_only: true,
        purchase_ids: [...data.purchase_ids, ...selected], expected_purchase_ids: data.purchase_ids, reason: reason.trim(),
      } }, getGraphqlAuthHeaders());
      setSelected([]);
      setReason("");
      retry();
    } catch (requestError) {
      const message = (requestError as { response?: { errors?: { message?: string }[] } }).response?.errors?.[0]?.message;
      throw new Error(message && message !== "Internal server error" ? message : "Không thể lưu kết quả xác minh.");
    }
  };

  return { data, quantities: result?.data?.quantities, selected, reason, canSave, save, setSelected, setReason, loadError, loading, retry };
};
