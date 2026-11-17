import ProductThumbnail from "./ProductThumbnail.jsx";
import { optionIsSelectable, resolveSelectedSku } from "../../services/skuSelection.js";
import feature from "./CustomerPortalFeatures.module.css";

export default function ProductVariantSelector({ groups, skus, selection, extractionComplete, onChange }) {
  if (!groups?.length) return null;
  const select = (group, option) => {
    const next = { ...selection, [group.group_id]: option.value_id };
    onChange(next, resolveSelectedSku(groups, skus, next));
  };
  return <section className={`${feature.variantSelector} ${feature.fullField}`} aria-label="Phân loại sản phẩm">
    {groups.map((group) => <fieldset className={feature.variantGroup} key={group.group_id}>
      <legend>{group.name}</legend>
      <div className={feature.variantOptions}>
        {group.values.map((option) => {
          const disabled = option.availability === false || !optionIsSelectable(group.group_id, option.value_id, skus, selection, extractionComplete);
          const selected = selection?.[group.group_id] === option.value_id;
          return <button type="button" key={`${group.group_id}-${option.value_id || option.label}`} className={selected ? feature.variantOptionSelected : feature.variantOption} disabled={disabled} aria-pressed={selected} onClick={() => select(group, option)}>
            {option.image && <ProductThumbnail src={option.image} alt="" size="small" />}
            <span>{option.label}</span>
          </button>;
        })}
      </div>
    </fieldset>)}
    {!extractionComplete && <p className={feature.variantWarning}>Trang có phân loại nhưng Extension chưa xác minh được đầy đủ các tổ hợp SKU. Chỉ dùng dữ liệu đã hiển thị hoặc nhập phân loại thủ công.</p>}
  </section>;
}
