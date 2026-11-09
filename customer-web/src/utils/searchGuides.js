export function normalizeSearchText(value = "") {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim().replace(/\s+/g, " ");
}

export function searchGuides(guides, query = "", category = "all") {
  const term = normalizeSearchText(query);
  return guides.filter((guide) => {
    if (guide.status !== "published") return false;
    if (category !== "all" && guide.category !== category) return false;
    if (!term) return true;
    const haystack = normalizeSearchText([guide.title, guide.description, guide.category, guide.categoryLabel, ...(guide.keywords || [])].join(" "));
    return term.split(" ").every((word) => haystack.includes(word));
  });
}
