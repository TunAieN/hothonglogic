(() => {
  const PROTOCOL_VERSION = "1.0";
  const ROOTS = Object.freeze({ "taobao.com": "Taobao", "tmall.com": "Tmall", "1688.com": "1688" });

  const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const number = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const match = String(value).replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  };
  const absoluteImage = (value, baseUrl) => {
    const candidate = text(value).replace(/^\/\//, "https://");
    if (!candidate || /^(?:data|javascript|file):/i.test(candidate)) return null;
    try {
      const url = new URL(candidate, baseUrl);
      return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
    } catch { return null; }
  };
  const platformForUrl = (value) => {
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/\.$/, "");
      return Object.entries(ROOTS).find(([root]) => host === root || host.endsWith(`.${root}`))?.[1] ?? null;
    } catch { return null; }
  };
  const normalizeUrl = (value) => {
    const url = new URL(String(value || "").trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !platformForUrl(url)) {
      throw new Error("UNSUPPORTED_PRODUCT_URL");
    }
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:spm|scm|utm_|ali_trackid|pvid)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  };
  const productId = (value) => {
    try {
      const url = new URL(value);
      return url.searchParams.get("id") || url.pathname.match(/(?:offer|item)\/(\d+)/i)?.[1] || null;
    } catch { return null; }
  };
  const images = (values, baseUrl) => [...new Set((values || []).map((value) => absoluteImage(value, baseUrl)).filter(Boolean))].slice(0, 30);
  const quantityTiers = (values) => (values || []).map((tier) => ({
    minimum_quantity: number(tier?.minimum_quantity),
    price_cny: number(tier?.price_cny ?? tier?.price),
  })).filter((tier) => tier.minimum_quantity !== null && tier.price_cny !== null).sort((a, b) => a.minimum_quantity - b.minimum_quantity);
  const attributes = (values) => (values || []).map((attribute) => ({
    group_id: text(attribute?.group_id) || null,
    value_id: text(attribute?.value_id) || null,
    name: text(attribute?.name),
    value: text(attribute?.value),
  })).filter((attribute) => attribute.name && attribute.value);
  const sku = (value, baseUrl, index) => {
    const normalizedAttributes = attributes(value?.attributes);
    return ({
    sku_id: text(value?.sku_id || value?.id) || null,
    combination_id: text(value?.combination_id) || null,
    label: text(value?.label || normalizedAttributes.map((attribute) => attribute.value).join(" / ") || [value?.color, value?.size].filter(Boolean).join(" / ")) || `Phân loại ${index + 1}`,
    attributes: normalizedAttributes,
    color: text(value?.color) || null,
    size: text(value?.size) || null,
    price_cny: number(value?.price_cny ?? value?.price),
    image: absoluteImage(value?.image, baseUrl),
    availability: typeof value?.availability === "boolean" ? value.availability : null,
    minimum_quantity: number(value?.minimum_quantity),
    quantity_price_tiers: quantityTiers(value?.quantity_price_tiers),
  });
  };
  const attributeGroups = (groups, baseUrl) => (groups || []).map((group, index) => ({
    group_id: text(group?.group_id || group?.id) || `group-${index + 1}`,
    name: text(group?.name || group?.label) || `Phân loại ${index + 1}`,
    semantic: ["color", "size"].includes(group?.semantic) ? group.semantic : null,
    values: (group?.values || []).map((value) => ({
      value_id: text(value?.value_id || value?.id) || null,
      label: text(value?.label || value?.value || value?.name),
      image: absoluteImage(value?.image, baseUrl),
      availability: typeof value?.availability === "boolean" ? value.availability : null,
    })).filter((value) => value.label),
  })).filter((group) => group.values.length);
  const normalizeProduct = (raw, context = {}) => {
    const normalizedUrl = normalizeUrl(raw?.normalized_url || raw?.source_url || raw?.url || context.url);
    const platform = platformForUrl(normalizedUrl);
    const normalizedImages = images([raw?.main_image, raw?.image, raw?.img, ...(raw?.images || [])], normalizedUrl);
    const skus = (raw?.skus || []).map((entry, index) => typeof entry === "string" ? sku({ label: entry }, normalizedUrl, index) : sku(entry, normalizedUrl, index));
    const groups = attributeGroups(raw?.attribute_groups, normalizedUrl);
    const inferredVariants = groups.length > 0 || skus.some((entry) => entry.attributes.length > 0);
    const hasVariants = typeof raw?.has_variants === "boolean" ? raw.has_variants : inferredVariants;
    const skuComplete = typeof raw?.sku_extraction_complete === "boolean"
      ? raw.sku_extraction_complete
      : (hasVariants ? skus.length > 0 && skus.every((entry) => entry.sku_id && (!groups.length || entry.attributes.length === groups.length)) : true);
    const price = number(raw?.price_cny ?? raw?.price);
    const title = text(raw?.title || raw?.name) || null;
    const missing = [];
    if (!title) missing.push("title");
    if (!normalizedImages.length) missing.push("images");
    if (price === null && !skus.some((entry) => entry.price_cny !== null)) missing.push("price_cny");
    if (hasVariants && !skuComplete) missing.push("skus");
    return {
      protocol_version: PROTOCOL_VERSION,
      request_id: context.requestId || raw?.request_id || null,
      platform,
      product_id: text(raw?.product_id) || productId(normalizedUrl),
      source_url: text(raw?.source_url || raw?.url || context.url) || normalizedUrl,
      normalized_url: normalizedUrl,
      title,
      title_original: text(raw?.title_original || raw?.title) || null,
      seller_name: text(raw?.seller_name || raw?.seller) || null,
      seller_url: text(raw?.seller_url || raw?.sellerUrl) || null,
      main_image: normalizedImages[0] || null,
      images: normalizedImages,
      currency: "CNY",
      price_cny: price,
      original_price_cny: number(raw?.original_price_cny ?? raw?.originalPrice),
      min_price_cny: number(raw?.min_price_cny),
      max_price_cny: number(raw?.max_price_cny),
      selected_sku_id: text(raw?.selected_sku_id) || null,
      selected_color: text(raw?.selected_color || raw?.color) || null,
      selected_size: text(raw?.selected_size || raw?.size) || null,
      quantity: number(raw?.quantity) || 1,
      skus,
      attribute_groups: groups,
      valid_sku_combinations: skus.filter((entry) => entry.sku_id).map((entry) => ({ sku_id: entry.sku_id, attribute_value_ids: entry.attributes.map((attribute) => attribute.value_id).filter(Boolean) })),
      has_variants: hasVariants,
      sku_extraction_complete: skuComplete,
      variant_price_cny: number(raw?.variant_price_cny),
      quantity_price_tiers: quantityTiers(raw?.quantity_price_tiers),
      extraction_source: context.source || raw?.extraction_source || "extension_dom",
      extraction_status: missing.length === 0 ? "success" : (title || normalizedImages.length || price !== null ? "partial" : "unavailable"),
      missing_fields: missing,
      extracted_at: new Date().toISOString(),
    };
  };

  globalThis.VietTrungProductContract = Object.freeze({ PROTOCOL_VERSION, platformForUrl, normalizeUrl, normalizeProduct });
})();
