import { useEffect, useMemo, useState } from "react";
import * as cart from "../services/customerLocalCart.js";

export default function useCustomerCart(customerId) {
  const [document, setDocument] = useState(() => customerId ? cart.getCart(customerId) : { items: [], request_note: "" });
  const [drafts, setDrafts] = useState(() => customerId ? cart.getDrafts(customerId) : []);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    const sync = () => {
      if (!customerId) { setDocument({ items: [], request_note: "" }); setDrafts([]); return; }
      try { setDocument(cart.getCart(customerId)); setDrafts(cart.getDrafts(customerId)); setStorageError(""); }
      catch (error) { setDocument({ items: [], request_note: "" }); setDrafts([]); setStorageError(error.message); }
    };
    const timer = window.setTimeout(sync, 0);
    const unsubscribe = customerId ? cart.subscribe(customerId, setDocument) : undefined;
    const unsubscribeDrafts = customerId ? cart.subscribeDrafts(customerId, setDrafts) : undefined;
    return () => { window.clearTimeout(timer); unsubscribe?.(); unsubscribeDrafts?.(); };
  }, [customerId]);

  const run = (operation) => (...args) => {
    try { setStorageError(""); return operation(customerId, ...args); }
    catch (error) { setStorageError(error.message); throw error; }
  };

  return {
    items: document.items || [],
    drafts,
    requestNote: document.request_note || "",
    totals: useMemo(() => cart.getTotals(document.items), [document.items]),
    storageError,
    addItem: run(cart.addItem), updateItem: run(cart.updateItem), removeItem: run(cart.removeItem), clearCart: run(cart.clearCart),
    updateRequestNote: run(cart.updateRequestNote),
    saveDraft: run(cart.saveDraft), deleteDraft: run(cart.deleteDraft), restoreDraftToCart: run(cart.restoreDraftToCart),
    getOrCreateSubmission: (...args) => cart.getOrCreateSubmission(customerId, ...args),
    removeSubmittedSnapshot: (...args) => cart.removeSubmittedSnapshot(customerId, ...args),
  };
}
