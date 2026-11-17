(() => {
  const text = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const number = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const match = String(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  };
  const image = (value, baseUrl) => {
    const candidate = text(value).replace(/^\/\//, "https://");
    if (!candidate) return null;
    try {
      const url = new URL(candidate, baseUrl);
      return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
    } catch { return null; }
  };
  const semantic = (name) => {
    if (/(?:颜色|顏色|color|colour)/i.test(name)) return "color";
    if (/(?:尺码|尺寸|大小|鞋码|size|\bcm\b|\beu\b|\bus\b|\buk\b)/i.test(name)) return "size";
    return null;
  };
  const first = (...values) => values.find((value) => value !== null && value !== undefined && value !== "");
  const list = (value) => Array.isArray(value) ? value : [];
  const valuesFor = (group) => list(first(group?.values, group?.propValues, group?.valueList, group?.children));
  const groupName = (group) => text(first(group?.name, group?.propName, group?.prop, group?.title, group?.label));
  const groupId = (group, index) => text(first(group?.pid, group?.propId, group?.id, group?.prop, group?.name)) || `group-${index + 1}`;
  const valueId = (value) => text(first(value?.vid, value?.valueId, value?.id, value?.value, value?.name));
  const valueLabel = (value) => text(first(value?.name, value?.value, value?.label, value?.title));

  function normalizeGroups(groups, baseUrl) {
    return list(groups).map((group, groupIndex) => {
      const name = groupName(group);
      const id = groupId(group, groupIndex);
      const seen = new Set();
      const values = valuesFor(group).map((value) => ({
        value_id: valueId(value),
        label: valueLabel(value),
        image: image(first(value?.image, value?.imageUrl, value?.imgUrl, value?.picture), baseUrl),
        availability: typeof value?.availability === "boolean" ? value.availability : (value?.disabled === true || value?.soldOut === true ? false : null),
      })).filter((value) => value.label && !seen.has(`${value.value_id}|${value.label}`) && seen.add(`${value.value_id}|${value.label}`));
      return { group_id: id, name: name || `Phân loại ${groupIndex + 1}`, semantic: semantic(name), values };
    }).filter((group) => group.values.length);
  }

  const pathParts = (value) => text(value).split(/[;，,]/).map((part) => part.trim()).filter(Boolean);
  function attributesFromPath(path, groups) {
    const attributes = [];
    for (const part of pathParts(path)) {
      const [propertyId, optionId] = part.split(":");
      const group = groups.find((entry) => entry.group_id === propertyId || entry.values.some((value) => value.value_id === optionId));
      const option = group?.values.find((value) => value.value_id === optionId);
      if (group && option) attributes.push({ group_id: group.group_id, value_id: option.value_id, name: group.name, value: option.label });
    }
    return attributes;
  }
  function attributesFromLabels(value, groups) {
    const labels = text(value).replace(/&gt;|＞/g, ">").split(/[>；;|]/).map(text).filter(Boolean);
    return labels.map((label) => {
      const group = groups.find((entry) => entry.values.some((option) => option.label === label));
      const option = group?.values.find((entry) => entry.label === label);
      return group && option ? { group_id: group.group_id, value_id: option.value_id, name: group.name, value: option.label } : null;
    }).filter(Boolean);
  }
  const priceFrom = (info) => [info?.price_cny, info?.priceText, info?.priceValue, info?.promotionPrice, info?.discountPrice, info?.price?.priceText, info?.price?.price, typeof info?.price === "object" ? null : info?.price]
    .map(number).find((value) => value !== null) ?? null;
  const quantityFrom = (info) => number(first(info?.quantity, info?.stock, info?.amountOnSale, info?.canBookCount, info?.inventory));
  const availabilityFrom = (info) => {
    if (typeof info?.availability === "boolean") return info.availability;
    if (typeof info?.available === "boolean") return info.available;
    const quantity = quantityFrom(info);
    return quantity === null ? null : quantity > 0;
  };
  function normalizeTiers(values) {
    return list(values).map((tier) => ({
      minimum_quantity: number(first(tier?.minimum_quantity, tier?.startQuantity, tier?.startAmount, tier?.beginAmount, tier?.minQuantity, tier?.range)),
      price_cny: priceFrom(tier),
    })).filter((tier) => tier.minimum_quantity !== null && tier.price_cny !== null).sort((a, b) => a.minimum_quantity - b.minimum_quantity);
  }

  function normalizeContainer(container, baseUrl) {
    const base = container?.skuBase || container?.skuModel || container || {};
    const core = container?.skuCore || container?.skuModel || container || {};
    const groups = normalizeGroups(first(base.props, base.skuProps, container?.skuProps), baseUrl);
    const infoMap = first(core.sku2info, core.skuInfoMap, base.skuInfoMap, container?.skuMap, container?.skuInfoMap) || {};
    const descriptors = list(first(base.skus, base.skuList, container?.skuList));
    const normalized = [];
    const seen = new Set();
    const push = (descriptor, mapKey = "") => {
      const skuId = text(first(descriptor?.skuId, descriptor?.sku_id, descriptor?.id, descriptor?.specId, descriptor?.offerId));
      if (!skuId || skuId === "0" || seen.has(skuId)) return;
      const info = infoMap[skuId] || infoMap[String(skuId)] || descriptor;
      const path = first(descriptor?.propPath, descriptor?.prop_path, descriptor?.properties, descriptor?.specAttrs, mapKey);
      const attributes = String(path || "").includes(":") ? attributesFromPath(path, groups) : attributesFromLabels(path, groups);
      const chosenImage = attributes.map((attribute) => groups.find((group) => group.group_id === attribute.group_id)?.values.find((value) => value.value_id === attribute.value_id)?.image).find(Boolean);
      normalized.push({
        sku_id: skuId,
        combination_id: text(first(descriptor?.propPath, descriptor?.prop_path, descriptor?.combinationId)) || null,
        label: attributes.map((attribute) => attribute.value).join(" / ") || text(first(descriptor?.name, descriptor?.label, mapKey)) || skuId,
        attributes,
        color: attributes.find((attribute) => semantic(attribute.name) === "color")?.value || null,
        size: attributes.find((attribute) => semantic(attribute.name) === "size")?.value || null,
        price_cny: priceFrom(info),
        image: image(first(info?.image, info?.imageUrl, descriptor?.image, chosenImage), baseUrl),
        availability: availabilityFrom(info),
        minimum_quantity: number(first(info?.minimumQuantity, info?.beginAmount, info?.minOrderQuantity)),
        quantity_price_tiers: normalizeTiers(first(info?.quantityPriceTiers, info?.rangePrices, info?.skuRangePrices)),
      });
      seen.add(skuId);
    };
    descriptors.forEach((descriptor) => push(descriptor));
    if (!descriptors.length && infoMap && typeof infoMap === "object") {
      Object.entries(infoMap).forEach(([key, info]) => push({ ...info, skuId: first(info?.skuId, info?.sku_id, info?.id), specAttrs: first(info?.specAttrs, info?.attributes, key) }, key));
    }
    return {
      attribute_groups: groups,
      skus: normalized,
      quantity_price_tiers: normalizeTiers(first(container?.skuRangePrices, base?.skuRangePrices, core?.skuRangePrices, container?.rangePrices)),
      has_variants: groups.length > 0 || normalized.some((sku) => sku.attributes.length > 0),
      sku_extraction_complete: normalized.length > 0 && normalized.every((sku) => sku.sku_id && (!groups.length || sku.attributes.length === groups.length)),
    };
  }

  function containersFrom(root) {
    const found = [];
    const visited = new Set();
    const queue = [root];
    let inspected = 0;
    while (queue.length && inspected++ < 12000) {
      const value = queue.shift();
      if (!value || typeof value !== "object" || visited.has(value)) continue;
      visited.add(value);
      if (value.skuBase || value.skuCore || value.skuModel || value.skuInfoMap || value.sku2info) found.push(value);
      for (const child of Object.values(value)) if (child && typeof child === "object") queue.push(child);
    }
    return found;
  }
  function bestFromStates(states, baseUrl) {
    return states.flatMap(containersFrom).map((container) => normalizeContainer(container, baseUrl)).sort((a, b) => (b.skus.length * 100 + b.attribute_groups.length) - (a.skus.length * 100 + a.attribute_groups.length))[0] || null;
  }

  function balancedValue(source, marker) {
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) return null;
    let start = markerIndex + marker.length;
    while (/\s|:|=/.test(source[start] || "")) start += 1;
    if (!["{", "["].includes(source[start])) return null;
    const open = source[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0; let quoted = false; let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === open) depth += 1;
      else if (char === close && --depth === 0) {
        try { return JSON.parse(source.slice(start, index + 1)); } catch { return null; }
      }
    }
    return null;
  }
  function embeddedStates(documentRef) {
    const states = [];
    for (const script of documentRef.querySelectorAll('script[type="application/json"], script[type="application/ld+json"], script#__NEXT_DATA__, script')) {
      const source = script.textContent || "";
      if (!source || source.length > 8_000_000) continue;
      if (/^\s*[\[{]/.test(source)) {
        try { states.push(JSON.parse(source)); } catch {}
      }
      const fragment = {};
      for (const marker of ['"skuBase"', '"skuCore"', '"skuModel"']) {
        const value = balancedValue(source, marker);
        if (value) fragment[marker.slice(1, -1)] = value;
      }
      if (Object.keys(fragment).length) states.push(fragment);
    }
    return states;
  }
  function groupsFromDom(documentRef, baseUrl) {
    const roots = documentRef.querySelectorAll('#skuOptionsArea > div, [class*="skuProp"], [class*="SkuProp"], dl.tb-prop, [data-property-name]');
    const groups = [];
    for (const root of roots) {
      const name = text(root.getAttribute?.("data-property-name") || root.querySelector?.('[class*="ItemLabel"], [class*="itemLabel"], [class*="propName"], dt')?.textContent);
      if (!name) continue;
      const rawValues = [...root.querySelectorAll('button, li, [data-value-id], [class*="valueItem"]')];
      const values = rawValues.map((node) => ({
        id: node.getAttribute("data-value-id") || node.getAttribute("data-vid") || node.getAttribute("data-value") || text(node.textContent),
        name: text(node.getAttribute("title") || node.querySelector("img")?.alt || node.textContent),
        image: node.querySelector("img")?.currentSrc || node.querySelector("img")?.src || null,
        disabled: node.matches('[disabled], [aria-disabled="true"], [class*="disabled"], [class*="soldOut"]'),
      })).filter((value) => value.name && value.name.length < 160);
      if (values.length) groups.push({ name, values });
    }
    return normalizeGroups(groups, baseUrl);
  }
  function extract(documentRef, baseUrl) {
    const embedded = bestFromStates(embeddedStates(documentRef), baseUrl);
    const domGroups = groupsFromDom(documentRef, baseUrl);
    if (embedded?.skus.length) {
      if (!embedded.attribute_groups.length && domGroups.length) embedded.attribute_groups = domGroups;
      return embedded;
    }
    return {
      attribute_groups: embedded?.attribute_groups.length ? embedded.attribute_groups : domGroups,
      skus: [], quantity_price_tiers: embedded?.quantity_price_tiers || [],
      has_variants: Boolean(embedded?.has_variants || domGroups.length),
      sku_extraction_complete: !embedded?.has_variants && !domGroups.length,
    };
  }

  globalThis.VietTrungSkuExtractor = Object.freeze({ normalizeContainer, bestFromStates, balancedValue, extract, semantic });
})();
