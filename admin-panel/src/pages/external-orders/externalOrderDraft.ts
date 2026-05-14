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

export const generateDraftId = () => {
  return `DRAFT-${Date.now()}`;
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

    return parsed.filter((draft) => draft && Array.isArray(draft.items));
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