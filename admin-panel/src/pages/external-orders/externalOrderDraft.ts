export const EXTERNAL_ORDER_DRAFT_STORAGE_KEY = "external-order-draft";

// export type ExternalOrderDraftItem = {
//   source_item_id?: string | number;
//   product_name: string;
//   product_link: string;
//   product_image?: string;
//   variant?: string;
//   quantity: number;
//   price_cny: number;
//   note?: string;
//   seller?: string;
//   size?: string;
//   color?: string;
// };

// export type ExternalOrderDraft = {
//   source?: string;
//   customer_id?: string | null;
//   order_note?: string;
//   created_at?: string;
//   items: ExternalOrderDraftItem[];
// };

// export const parseExternalOrderDraft = (value: string | null) => {
//   if (!value) {
//     return null;
//   }

//   try {
//     return JSON.parse(value) as ExternalOrderDraft;
//   } catch (error) {
//     console.error("Failed to parse external order draft.", error);
//     return null;
//   }
// };

// export const loadExternalOrderDraft = () =>
//   parseExternalOrderDraft(localStorage.getItem(EXTERNAL_ORDER_DRAFT_STORAGE_KEY));

// export const saveExternalOrderDraft = (draft: ExternalOrderDraft) => {
//   localStorage.setItem(EXTERNAL_ORDER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
// };

// export const clearExternalOrderDraft = () => {
//   localStorage.removeItem(EXTERNAL_ORDER_DRAFT_STORAGE_KEY);
// };
export const EXTERNAL_ORDER_DRAFTS_STORAGE_KEY = "external-order-drafts";

export type ExternalOrderDraftItem = {
  source_item_id?: string | number;
  product_name: string;
  product_link: string;
  product_image?: string;
  variant?: string;
  quantity: number;
  price_cny: number;
  note?: string;
  seller?: string;
  size?: string;
  color?: string;
};

export type ExternalOrderDraft = {
  draft_id: string;
  source?: string;
  customer_id?: string | null;
  order_note?: string;
  created_at?: string;
  items: ExternalOrderDraftItem[];
};

const DRAFT_DUPLICATE_WINDOW_MS = 10_000;

export const generateDraftId = () => {
  return `DRAFT-${Date.now()}`;
};

const normalizeOptionalString = (value?: string | null) => value?.trim() || "";

const getDraftSignature = (draft: Pick<ExternalOrderDraft, "source" | "customer_id" | "order_note" | "items">) =>
  JSON.stringify({
    source: normalizeOptionalString(draft.source),
    customer_id: draft.customer_id ?? null,
    order_note: normalizeOptionalString(draft.order_note),
    items: (draft.items || []).map((item) => ({
      source_item_id: item.source_item_id ?? null,
      product_name: normalizeOptionalString(item.product_name),
      product_link: normalizeOptionalString(item.product_link),
      product_image: normalizeOptionalString(item.product_image),
      variant: normalizeOptionalString(item.variant),
      quantity: Number(item.quantity) || 0,
      price_cny: Number(item.price_cny) || 0,
      note: normalizeOptionalString(item.note),
      seller: normalizeOptionalString(item.seller),
      size: normalizeOptionalString(item.size),
      color: normalizeOptionalString(item.color),
    })),
  });

const isRecentlyCreatedDraft = (draft: ExternalOrderDraft) => {
  const createdAt = new Date(draft.created_at ?? "").getTime();

  if (Number.isNaN(createdAt)) {
    return false;
  }

  return Math.abs(Date.now() - createdAt) <= DRAFT_DUPLICATE_WINDOW_MS;
};

const dedupeDrafts = (drafts: ExternalOrderDraft[]) => {
  const seen = new Set<string>();
  const nextDrafts: ExternalOrderDraft[] = [];

  for (const draft of drafts) {
    if (!draft || !Array.isArray(draft.items)) {
      continue;
    }

    const signature = getDraftSignature(draft);
    const dedupeKey = isRecentlyCreatedDraft(draft)
      ? `recent::${signature}`
      : `draft-id::${draft.draft_id}`;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    nextDrafts.push(draft);
  }

  return nextDrafts;
};

export const parseExternalOrderDraft = (value: string | null) => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<ExternalOrderDraft>;

    if (!parsed || !Array.isArray(parsed.items)) {
      return null;
    }

    return {
      ...parsed,
      draft_id: parsed.draft_id || generateDraftId(),
      created_at: parsed.created_at || new Date().toISOString(),
      items: parsed.items,
    } as ExternalOrderDraft;
  } catch (error) {
    console.error("Failed to parse external order draft.", error);
    return null;
  }
};

export const loadExternalOrderDrafts = (): ExternalOrderDraft[] => {
  try {
    const raw = localStorage.getItem(EXTERNAL_ORDER_DRAFTS_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const drafts = parsed.filter((draft) => draft && Array.isArray(draft.items));
    const dedupedDrafts = dedupeDrafts(drafts);

    if (dedupedDrafts.length !== drafts.length) {
      saveExternalOrderDrafts(dedupedDrafts);
    }

    return dedupedDrafts;
  } catch (error) {
    console.error("Failed to load external order drafts.", error);
    return [];
  }
};

export const saveExternalOrderDrafts = (drafts: ExternalOrderDraft[]) => {
  localStorage.setItem(EXTERNAL_ORDER_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
};

export const addExternalOrderDraft = (draft: ExternalOrderDraft) => {
  const drafts = loadExternalOrderDrafts();

  const draftWithId: ExternalOrderDraft = {
    ...draft,
    draft_id: draft.draft_id || generateDraftId(),
    created_at: draft.created_at || new Date().toISOString(),
    items: draft.items || [],
  };

  const incomingSignature = getDraftSignature(draftWithId);
  const duplicatedDraft = drafts.find(
    (currentDraft) =>
      isRecentlyCreatedDraft(currentDraft) &&
      getDraftSignature(currentDraft) === incomingSignature,
  );

  if (duplicatedDraft) {
    return duplicatedDraft;
  }

  saveExternalOrderDrafts([draftWithId, ...drafts]);

  return draftWithId;
};

export const updateExternalOrderDraft = (
  draftId: string,
  patch: Partial<ExternalOrderDraft>,
) => {
  const drafts = loadExternalOrderDrafts();

  const nextDrafts = drafts.map((draft) =>
    draft.draft_id === draftId
      ? {
          ...draft,
          ...patch,
          draft_id: draft.draft_id,
        }
      : draft,
  );

  saveExternalOrderDrafts(nextDrafts);
};

export const removeExternalOrderDraft = (draftId: string) => {
  const drafts = loadExternalOrderDrafts();

  const nextDrafts = drafts.filter((draft) => draft.draft_id !== draftId);

  saveExternalOrderDrafts(nextDrafts);

  return nextDrafts;
};

export const clearExternalOrderDrafts = () => {
  localStorage.removeItem(EXTERNAL_ORDER_DRAFTS_STORAGE_KEY);
};
