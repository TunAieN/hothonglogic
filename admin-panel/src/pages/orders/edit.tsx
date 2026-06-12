import { useEffect, useMemo, useState } from "react";
import { useGetIdentity, useList, useOne, useUpdate, type HttpError } from "@refinedev/core";
import {
  Alert,
  App,
  Breadcrumb,
  Card,
  Col,
  ConfigProvider,
  Form,
  Layout,
  Row,
  Space,
  Spin,
  Typography,
} from "antd";
import type { UploadFile } from "antd/es/upload/interface";

import { useParams } from "react-router";
import type { ICustomer, IOrder, User } from "../../interfaces";
import type { OrderUpdateInput } from "../../types";
import { CustomerPersonnelSection } from "./components/CustomerPersonnelSection";
import { ReceiverInformationSection } from "./components/ReceiverInformationSection";
import { ShippingInfoSection } from "./components/ShippingInfoSection";
import { NotesSection } from "./components/NotesSection";
import { AttachmentsSection } from "./components/AttachmentsSection";
import { OrderSummaryPanel } from "./components/OrderSummaryPanel";
import {
  PACKAGING_TYPE_OPTIONS,
  SHIPPING_COMPANY_OPTIONS,
  SHIPPING_METHOD_OPTIONS,
  type OrderEditFormValues,
  type SelectOption,
} from "./orderEditTypes";
import {
  getDefaultShippingEntry,
  parseOrderEditNote,
  serializeOrderEditNote,
} from "./orderEditNoteMeta";
import type { ShippingEntryFormValue } from "./orderEditTypes";

const { Content } = Layout;
const { Title, Text } = Typography;

const PAGE_STYLES = `
  .order-edit-app {
    min-height: 100vh;
    background:
      radial-gradient(circle at top left, rgba(93, 146, 255, 0.12), transparent 24%),
      radial-gradient(circle at top right, rgba(255, 208, 145, 0.12), transparent 18%),
      linear-gradient(180deg, #f7fafe 0%, #f5f8fc 100%);
  }

  .order-edit-app .ant-layout-sider {
    background: linear-gradient(180deg, #08204d 0%, #081938 100%) !important;
  }

  .order-edit-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 22px 16px 26px;
  }

  .order-edit-brand {
    align-items: center;
    display: flex;
    gap: 14px;
    margin-bottom: 28px;
    padding: 6px 8px 18px;
  }

  .order-edit-brand-mark {
    align-items: center;
    background: #fff;
    border-radius: 14px;
    color: #081a43;
    display: flex;
    flex: 0 0 42px;
    height: 42px;
    justify-content: center;
    width: 42px;
  }

  .order-edit-brand-copy .ant-typography {
    color: #fff;
    margin: 0;
  }

  .order-edit-brand-copy .order-edit-brand-subtitle {
    color: #b2c0dc;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .order-edit-sidebar .ant-menu {
    background: transparent;
    border-inline-end: 0;
  }

  .order-edit-sidebar .ant-menu-item {
    align-items: center;
    border-radius: 14px;
    color: #dce5f8;
    display: flex;
    font-size: 15px;
    height: 52px;
    margin-block: 8px;
    padding-inline: 18px !important;
  }

  .order-edit-sidebar .ant-menu-item-selected {
    background: #0d356f !important;
    color: #73ffd8 !important;
    font-weight: 600;
  }

  .order-edit-sidebar .ant-menu-item .ant-menu-title-content {
    margin-left: 12px;
  }

  .order-edit-new-shipment {
    border-radius: 14px;
    font-weight: 600;
    height: 52px;
    margin-top: auto;
  }

  .order-edit-main {
    background: transparent;
  }

  .order-edit-header {
    align-items: center;
    background: rgba(250, 248, 244, 0.94);
    border-bottom: 1px solid #ece8e1;
    display: flex;
    gap: 24px;
    height: 86px;
    justify-content: space-between;
    padding: 0 32px;
    position: sticky;
    top: 0;
    z-index: 20;
  }

  .order-edit-header-search {
    background: #efebe6;
    border: 0;
    border-radius: 16px;
    height: 40px;
    max-width: 310px;
  }

  .order-edit-header-search .ant-input {
    background: transparent;
  }

  .order-edit-header-tabs .ant-tabs-nav {
    margin: 0;
  }

  .order-edit-header-tabs .ant-tabs-tab {
    font-weight: 500;
    padding-inline: 2px;
  }

  .order-edit-header-tabs .ant-tabs-ink-bar {
    background: #0b1533;
  }

  .order-edit-user-badge {
    align-items: center;
    display: flex;
    gap: 12px;
  }

  .order-edit-user-badge .order-edit-user-role {
    color: #6b7280;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .order-edit-page-body {
    padding: 26px 38px 42px;
  }

  .order-edit-breadcrumb,
  .order-edit-breadcrumb a {
    color: #6b7280 !important;
    font-size: 13px;
  }

  .order-edit-page-title {
    color: #081a43 !important;
    font-size: 44px !important;
    font-weight: 800 !important;
    letter-spacing: -0.03em;
    margin: 4px 0 0 !important;
  }

  .order-edit-page-meta {
    color: #667085;
    font-size: 14px;
  }

  .order-edit-page-meta .order-edit-meta-dot {
    color: #c2c8d2;
    margin: 0 10px;
  }

  .order-edit-rate-card.ant-card {
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid #e6edf8;
    border-radius: 16px;
    box-shadow: 0 10px 26px rgba(32, 55, 104, 0.08);
  }

  .order-edit-rate-card .ant-card-body {
    padding: 14px 20px;
    text-align: center;
  }

  .order-edit-rate-label {
    color: #7d89a0;
    font-size: 12px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .order-edit-rate-value {
    color: #16a34a !important;
    font-size: 28px !important;
    font-weight: 800 !important;
    line-height: 1;
    margin-top: 4px;
  }

  .order-edit-section-card.ant-card,
  .order-edit-summary-card.ant-card,
  .order-edit-context-card.ant-card {
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #e8eef7;
    border-radius: 22px;
    box-shadow: 0 14px 34px rgba(31, 65, 114, 0.07);
  }

  .order-edit-section-card .ant-card-body,
  .order-edit-context-card .ant-card-body {
    padding: 22px 24px;
  }

  .order-edit-section-head {
    align-items: center;
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .order-edit-section-title.ant-typography {
    color: #11338f;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .order-edit-page-body .ant-form-item {
    margin-bottom: 18px;
  }

  .order-edit-page-body .ant-form-item-label > label {
    color: #344054;
    font-size: 13px;
    font-weight: 600;
  }

  .order-edit-page-body .ant-form-item-required::before {
    color: #d62828 !important;
  }

  .order-edit-page-body .ant-input,
  .order-edit-page-body .ant-input-number,
  .order-edit-page-body .ant-input-number-group-addon,
  .order-edit-page-body .ant-input-number-input,
  .order-edit-page-body .ant-select-selector,
  .order-edit-page-body .ant-input-affix-wrapper,
  .order-edit-page-body textarea.ant-input {
    background: #ffffff !important;
    border-color: #d9e3f2 !important;
    border-radius: 12px !important;
    box-shadow: none !important;
  }

  .order-edit-page-body .ant-input,
  .order-edit-page-body .ant-select-selector,
  .order-edit-page-body .ant-input-number,
  .order-edit-page-body .ant-input-affix-wrapper {
    min-height: 44px;
  }

  .order-edit-page-body .ant-input:hover,
  .order-edit-page-body .ant-input-number:hover,
  .order-edit-page-body .ant-select:hover .ant-select-selector,
  .order-edit-page-body .ant-input-affix-wrapper:hover {
    border-color: #bfd1ec !important;
  }

  .order-edit-page-body .ant-input:focus,
  .order-edit-page-body .ant-input-focused,
  .order-edit-page-body .ant-input-number-focused,
  .order-edit-page-body .ant-select-focused .ant-select-selector,
  .order-edit-page-body .ant-input-affix-wrapper-focused {
    border-color: #7aa2f7 !important;
    box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.12) !important;
  }

  .order-edit-page-body .ant-input[disabled],
  .order-edit-page-body .ant-input-number-disabled,
  .order-edit-page-body .ant-select-disabled .ant-select-selector,
  .order-edit-page-body .ant-input-affix-wrapper-disabled,
  .order-edit-page-body textarea.ant-input[disabled] {
    background: #f8fafc !important;
    color: #667085 !important;
  }

  .order-edit-page-body .ant-select-selector {
    padding-top: 8px !important;
  }

  .order-edit-page-body textarea.ant-input {
    min-height: 152px;
    padding-top: 14px;
  }

  .order-edit-tip-banner {
    background: #fff9ef;
    border: 1px solid #f8d9a0;
    border-radius: 14px;
    color: #b7791f;
    font-size: 13px;
    line-height: 1.55;
    padding: 10px 14px;
  }

  .order-edit-shipping-remove {
    align-items: center;
    display: flex;
    height: 100%;
    justify-content: center;
    padding-top: 8px;
  }

  .order-edit-shipping-remove .ant-btn {
    background: #fdeeee;
    border: 0;
    border-radius: 12px;
    color: #cb2525;
    height: 52px;
    width: 52px;
  }

  .order-edit-add-tracking {
    background: #f5fbf6;
    border: 1px solid #b7e4c7;
    border-radius: 12px;
    color: #12824c;
    font-weight: 600;
    width: fit-content;
  }

  .order-edit-muted-note {
    font-size: 13px;
  }

  .order-edit-section-card .ant-upload-wrapper .ant-upload-drag {
    background: #ffffff;
    border: 1px dashed #cfdbef;
    border-radius: 16px;
    min-height: 160px;
    padding: 20px 18px;
  }

  .order-edit-upload-title {
    color: #1d2939;
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 6px;
  }

  .order-edit-summary-card.ant-card {
    background: rgba(255, 255, 255, 0.97);
    border: 1px solid #e7eef8;
    color: #101828;
    overflow: hidden;
    position: sticky;
    top: 112px;
  }

  .order-edit-summary-card .ant-card-body {
    padding: 24px;
  }

  .order-edit-summary-kicker {
    color: #12358f;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .order-edit-summary-row {
    align-items: center;
    border-bottom: 1px solid #edf2f7;
    display: flex;
    justify-content: space-between;
    padding-bottom: 14px;
  }

  .order-edit-summary-row .ant-typography,
  .order-edit-summary-row .ant-badge {
    color: #101828;
  }

  .order-edit-live-badge {
    background: #f8fafc;
    border: 1px solid #d7e4f5;
    border-radius: 999px;
    color: #344054;
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 7px 12px;
  }

  .order-edit-confirm-button,
  .order-edit-update-button {
    border-radius: 12px;
    font-size: 17px;
    font-weight: 700;
    height: 52px;
    width: 100%;
  }

  .order-edit-confirm-button {
    background: linear-gradient(180deg, #22c55e 0%, #16a34a 100%);
    border-color: #16a34a;
  }

  .order-edit-update-button {
    background: #ffffff;
    border: 1px solid #d6dfec;
    color: #12358f;
  }

  .order-edit-context-label {
    color: #98a1b2;
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .order-edit-context-map {
    background:
      linear-gradient(180deg, rgba(247, 250, 255, 0.25), rgba(247, 250, 255, 0.9)),
      radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.68), transparent 18%),
      radial-gradient(circle at 72% 42%, rgba(255, 255, 255, 0.6), transparent 14%),
      linear-gradient(135deg, #d6d8dd 0%, #f0f1f4 100%);
    border-radius: 28px;
    height: 240px;
    margin-top: 16px;
    position: relative;
  }

  .order-edit-context-map::before,
  .order-edit-context-map::after {
    background: rgba(255, 255, 255, 0.58);
    border-radius: 999px;
    content: "";
    position: absolute;
  }

  .order-edit-context-map::before {
    box-shadow:
      120px 30px 0 rgba(255, 255, 255, 0.58),
      240px 110px 0 rgba(255, 255, 255, 0.58),
      520px 60px 0 rgba(255, 255, 255, 0.58);
    height: 14px;
    left: 80px;
    top: 50px;
    width: 14px;
  }

  .order-edit-context-map::after {
    box-shadow:
      160px 90px 0 rgba(255, 255, 255, 0.58),
      310px 30px 0 rgba(255, 255, 255, 0.58),
      470px 120px 0 rgba(255, 255, 255, 0.58);
    height: 18px;
    left: 120px;
    top: 120px;
    width: 18px;
  }

  @media (max-width: 1199px) {
    .order-edit-summary-card.ant-card {
      position: static;
    }
  }

  @media (max-width: 991px) {
    .order-edit-app .ant-layout {
      display: block;
    }

    .order-edit-app .ant-layout-sider {
      flex: none !important;
      max-width: none !important;
      min-width: 100% !important;
      width: 100% !important;
    }

    .order-edit-header {
      align-items: flex-start;
      flex-direction: column;
      height: auto;
      padding-block: 18px;
    }

    .order-edit-page-body {
      padding: 18px 18px 28px;
    }

    .order-edit-page-title {
      font-size: 32px !important;
    }
  }
`;



const buildStaffOptions = (
  orders: IOrder[],
  currentUser?: User,
  selectedCreator?: Pick<User, "id" | "name">,
): SelectOption[] => {
  const optionMap = new Map<string, SelectOption>();

  const register = (user?: Pick<User, "id" | "name">) => {
    if (!user?.id || !user.name) {
      return;
    }

    optionMap.set(user.id, {
      value: user.id,
      label: user.name,
    });
  };

  register(currentUser);
  register(selectedCreator);
  orders.forEach((currentOrder) => register(currentOrder.creator));

  return Array.from(optionMap.values());
};

const getStatusLabel = (status?: string) => {
  const normalized = status?.toLowerCase();

  if (normalized === "awaiting_deposit") {
    return "CHỜ ĐẶT CỌC";
  }

  if (normalized === "deposited") {
    return "ĐÃ ĐẶT CỌC";
  }

  if (normalized === "purchasing") {
    return "ĐANG ĐẶT HÀNG";
  }

  if (normalized === "awaiting_tracking") {
    return "CHỜ MÃ VẬN ĐƠN";
  }

  if (normalized === "waiting_cn_warehouse") {
    return "CHỜ KHO TQ NHẬN HÀNG";
  }

  switch (normalized) {
    case "approved":
      return "ĐÃ DUYỆT";
    case "pending":
      return "CHỜ DUYỆT";
    case "cancelled":
      return "ĐÃ HỦY";
    case "rejected":
      return "ĐÃ TỪ CHỐI";
    case "shipped":
      return "ĐANG VẬN CHUYỂN";
    case "completed":
    case "delivered":
      return "HOÀN THÀNH";
    default:
      return "ĐANG XỬ LÝ";
  }
};

const normalizeStatus = (status?: string | null) => status?.trim().toLowerCase() ?? "";

const getDisplayStatusLabel = (status?: string) => {
  const normalized = normalizeStatus(status);

  switch (normalized) {
    case "awaiting_deposit":
      return "CHỜ ĐẶT CỌC";
    case "deposited":
      return "ĐÃ ĐẶT CỌC";
    case "purchasing":
      return "ĐANG ĐẶT HÀNG";
    case "awaiting_tracking":
      return "CHỜ MÃ VẬN ĐƠN";
    case "waiting_cn_warehouse":
      return "CHỜ KHO TQ NHẬN HÀNG";
    case "approved":
      return "ĐÃ DUYỆT";
    case "pending":
      return "CHỜ DUYỆT";
    case "cancelled":
      return "ĐÃ HỦY";
    case "rejected":
      return "ĐÃ TỪ CHỐI";
    case "shipped":
      return "ĐANG VẬN CHUYỂN";
    case "completed":
    case "delivered":
      return "HOÀN THÀNH";
    default:
      return "ĐANG XỬ LÝ";
  }
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "--";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
};

void getStatusLabel;

const isOrderCoreEditable = (status?: string) => normalizeStatus(status) === "pending";

const isTrackingEditableStatus = (status?: string) =>
  ["awaiting_tracking", "waiting_cn_warehouse"].includes(normalizeStatus(status));

const validateShippingEntries = (
  shippingEntries: ShippingEntryFormValue[],
  orderItems: NonNullable<IOrder["items"]> | undefined,
) => {
  const availableQuantityByItemId = new Map(
    (orderItems ?? []).map((item) => [item.id, item.quantity]),
  );
  const assignedQuantityByItemId = new Map<string, number>();

  shippingEntries.forEach((entry, entryIndex) => {
    if (entry.selectedItems.length === 0) {
      throw new Error(`Ma van don thu ${entryIndex + 1} chua co san pham nao duoc chon.`);
    }

    entry.selectedItems.forEach((selectedItem) => {
      const availableQuantity = availableQuantityByItemId.get(selectedItem.orderItemId);

      if (!availableQuantity) {
        throw new Error("Co san pham khong con hop le trong danh sach don hang.");
      }

      if (selectedItem.quantity <= 0) {
        throw new Error(`So luong cua mot san pham trong ma van don thu ${entryIndex + 1} phai lon hon 0.`);
      }

      const nextAssignedQuantity =
        (assignedQuantityByItemId.get(selectedItem.orderItemId) ?? 0) + selectedItem.quantity;

      if (nextAssignedQuantity > availableQuantity) {
        throw new Error("Tong so luong mot san pham da phan bo vao cac kien hang vuot qua so luong cua don.");
      }

      assignedQuantityByItemId.set(selectedItem.orderItemId, nextAssignedQuantity);
    });
  });
};

const mapCarrierToShippingCompany = (carrier?: string | null) => {
  const normalizedCarrier = carrier?.trim().toLowerCase();

  switch (normalizedCarrier) {
    case "vn express":
      return "vn-express";
    case "j&t express":
      return "jt-express";
    case "giao hang nhanh":
      return "ghn";
    case "dhl ecommerce":
      return "dhl";
    default:
      return "vn-express";
  }
};

const mapShippingCompanyToCarrier = (shippingCompany?: string) => {
  switch (shippingCompany) {
    case "jt-express":
      return "J&T Express";
    case "ghn":
      return "Giao Hang Nhanh";
    case "dhl":
      return "DHL eCommerce";
    case "vn-express":
    default:
      return "VN Express";
  }
};

const mapPackageToShippingEntry = (
  pkg: NonNullable<IOrder["cn_packages"]>[number],
  fallbackEntry?: ShippingEntryFormValue,
): ShippingEntryFormValue => ({
  // Backend expects OrderPackageInput.id to be the order_tracking id, not the cn_package id.
  packageId: pkg.order_tracking?.id ?? fallbackEntry?.packageId,
  trackingCode: pkg.tracking_number ?? "",
  parcelValue: pkg.declared_value ?? 0,
  shippingCompany: fallbackEntry?.shippingCompany ?? mapCarrierToShippingCompany(pkg.carrier),
  packagingType: fallbackEntry?.packagingType ?? "wooden-crating",
  packageNote: pkg.note ?? fallbackEntry?.packageNote ?? "",
  selectedItems:
    pkg.package_items?.map((packageItem) => ({
      orderItemId: packageItem.order_item_id,
      quantity: packageItem.quantity,
    })) ?? fallbackEntry?.selectedItems ?? [],
});

const mapTrackingToShippingEntry = (
  tracking: NonNullable<IOrder["order_trackings"]>[number],
  fallbackEntry?: ShippingEntryFormValue,
): ShippingEntryFormValue => ({
  packageId: tracking.id,
  trackingCode: tracking.tracking_number ?? "",
  parcelValue: tracking.declared_value ?? 0,
  shippingCompany: fallbackEntry?.shippingCompany ?? mapCarrierToShippingCompany(tracking.carrier),
  packagingType: fallbackEntry?.packagingType ?? "wooden-crating",
  packageNote: tracking.note ?? fallbackEntry?.packageNote ?? "",
  selectedItems:
    tracking.tracking_items?.map((trackingItem) => ({
      orderItemId: trackingItem.order_item_id,
      quantity: trackingItem.quantity,
    })) ?? fallbackEntry?.selectedItems ?? [],
});

export const OrderEdit = () => {
  const { id } = useParams();
  const { message } = App.useApp();
  const [form] = Form.useForm<OrderEditFormValues>();
  const [attachments, setAttachments] = useState<UploadFile[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const { data: identity } = useGetIdentity<User>();
  const { query } = useOne<IOrder>({
    resource: "orders",
    id: id ?? "",
    queryOptions: {
      enabled: Boolean(id),
    },
  });
  const { result: customersResult } = useList<ICustomer>({
    resource: "customers",
    pagination: {
      currentPage: 1,
      pageSize: 100,
    },
  });
  const { result: ordersResult } = useList<IOrder>({
    resource: "orders",
    pagination: {
      currentPage: 1,
      pageSize: 100,
    },
  });
  const { mutateAsync: updateOrder } = useUpdate<IOrder, HttpError, OrderUpdateInput>();

  const order = query.data?.data;
  const canEditOrderCore = isOrderCoreEditable(order?.status);
  const canEditTracking = isTrackingEditableStatus(order?.status);
  const canSaveChanges = canEditOrderCore || canEditTracking;
  const isLoading = query.isLoading;
  const customers = customersResult?.data ?? [];
  const orders = ordersResult?.data ?? [];
  const selectedCustomerId = Form.useWatch("customerId", form);
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId),
    [customers, selectedCustomerId],
  );

  const customerOptions = useMemo<SelectOption[]>(
    () =>
      customers.map((customer) => ({
        value: customer.id,
        label: `${customer.name}${customer.phone ? ` - ${customer.phone}` : ""}`,
      })),
    [customers],
  );

  const staffOptions = useMemo(
    () => buildStaffOptions(orders, identity, order?.creator),
    [identity, order?.creator, orders],
  );

  useEffect(() => {
    if (!order) {
      return;
    }

    const { meta, plainNote } = parseOrderEditNote(order.note);
    const shippingEntries =
      order.order_trackings && order.order_trackings.length > 0
        ? order.order_trackings.map((tracking, index) =>
            mapTrackingToShippingEntry(tracking, meta.shippingEntries?.[index]))
        : order.cn_packages && order.cn_packages.length > 0
          ? order.cn_packages.map((pkg, index) =>
              mapPackageToShippingEntry(pkg, meta.shippingEntries?.[index]))
        : meta.shippingEntries?.length
          ? meta.shippingEntries
          : [getDefaultShippingEntry()];

    form.setFieldsValue({
      accountManagerId:
        meta.accountManagerId ??
        order.creator?.id ??
        identity?.id,
      customerId: meta.customerId ?? order.customer_id ?? order.customer?.id,
      receiverName: meta.receiverName || order.customer?.name || "",
      receiverPhone: meta.receiverPhone || order.customer?.phone || "",
      receiverAddress: meta.receiverAddress || order.customer?.address || "",
      shippingMethod: meta.shippingMethod || "normal",
      shippingEntries,
      note: plainNote,
    });
  }, [form, identity?.id, order]);

  useEffect(() => {
    if (!selectedCustomer || !canEditOrderCore) {
      return;
    }

    form.setFieldsValue({
      receiverName: selectedCustomer.name || "",
      receiverPhone: selectedCustomer.phone || "",
      receiverAddress: selectedCustomer.address || "",
    });
  }, [canEditOrderCore, form, selectedCustomer]);

  const handleAttachmentChange = (files: UploadFile[]) => {
    const validFiles = files.filter((file) => {
      const isValidSize = (file.size ?? 0) <= 10 * 1024 * 1024;
      const isValidType =
        !file.type ||
        ["application/pdf", "image/jpeg", "image/png"].includes(file.type);

      if (!isValidSize) {
        message.error(`${file.name} vượt quá giới hạn 10MB.`);
      }

      if (!isValidType) {
        message.error(`${file.name} không đúng định dạng hỗ trợ.`);
      }

      return isValidSize && isValidType;
    });

    setAttachments(validFiles);
  };

  const submitOrderLegacy = async (values: OrderEditFormValues, nextStatus?: string) => {
    if (!order?.id || !canEditOrderCore) {
      return;
    }

    validateShippingEntries(values.shippingEntries, order?.items);

    const payload: OrderUpdateInput = {
      account_manager_id: values.accountManagerId,
      customer_id: values.customerId,
      packages: values.shippingEntries.map((entry) => ({
        id: entry.packageId,
        tracking_number: entry.trackingCode.trim() || null,
        declared_value: entry.parcelValue ?? 0,
        carrier: mapShippingCompanyToCarrier(entry.shippingCompany),
        note: entry.packageNote?.trim() || null,
        package_items: entry.selectedItems.map((selectedItem) => ({
          order_item_id: selectedItem.orderItemId,
          quantity: selectedItem.quantity,
        })),
      })),
      status: nextStatus ?? order.status,
      note: serializeOrderEditNote(values),
    };

    await updateOrder({
      resource: "orders",
      id: order.id,
      values: payload,
    });
  };

  const buildTrackingPackagesPayload = (values: OrderEditFormValues) => {
    validateShippingEntries(values.shippingEntries, order?.items);

    return values.shippingEntries.map((entry) => ({
      id: entry.packageId,
      tracking_number: entry.trackingCode.trim() || null,
      declared_value: entry.parcelValue ?? 0,
      carrier: mapShippingCompanyToCarrier(entry.shippingCompany),
      note: entry.packageNote?.trim() || null,
      package_items: entry.selectedItems.map((selectedItem) => ({
        order_item_id: selectedItem.orderItemId,
        quantity: selectedItem.quantity,
      })),
    }));
  };

  const submitOrderCoreUpdate = async (values: OrderEditFormValues) => {
    if (!order?.id || !canEditOrderCore) {
      return;
    }

    await updateOrder({
      resource: "orders",
      id: order.id,
      values: {
        account_manager_id: values.accountManagerId,
        customer_id: values.customerId,
        note: serializeOrderEditNote(values),
      },
    });
  };

  const submitTrackingUpdate = async (values: OrderEditFormValues) => {
    if (!order?.id || !canEditTracking) {
      return;
    }

    await updateOrder({
      resource: "orders",
      id: order.id,
      values: {
        packages: buildTrackingPackagesPayload(values),
      },
    });
  };

  const handleFinish = async (values: OrderEditFormValues) => {
    if (!canSaveChanges) {
      return;
    }

    setIsSaving(true);

    try {
      if (canEditOrderCore) {
        await submitOrderCoreUpdate(values);
      } else if (canEditTracking) {
        await submitTrackingUpdate(values);
      }
      message.success("Đơn hàng đã được cập nhật.");
      await query.refetch();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không thể cập nhật đơn hàng.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (!canEditOrderCore) {
      return;
    }

    try {
      setIsConfirming(true);
      const values = await form.validateFields();
      await submitOrderLegacy(values, "purchasing");
      message.success("Đơn hàng đã được xác nhận.");
      await query.refetch();
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      }
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#0a1f55",
          borderRadius: 16,
          fontFamily: `"Segoe UI", "Helvetica Neue", Arial, sans-serif`,
        },
      }}
    >
      <style>{PAGE_STYLES}</style>
      <Layout className="order-edit-app">
        <Layout className="order-edit-main">
          <Content className="order-edit-page-body">
            <Spin spinning={isLoading}>
              <Space orientation="vertical" size={28} style={{ width: "100%" }}>
                <Row justify="space-between" align="middle" gutter={[16, 16]}>
                  <Col>
                    <Space orientation="vertical" size={10}>
                      <Breadcrumb
                        className="order-edit-breadcrumb"
                        items={[
                          { title: "Đơn hàng" },
                          { title: "Quản lý đơn hàng" },
                          { title: `Sửa đơn hàng #${id}` },
                        ]}
                      />
                      <Title className="order-edit-page-title" level={1}>
                        Sửa đơn hàng #{id}
                      </Title>
                      <Text className="order-edit-page-meta">
                        Mã đơn: {order?.order_code ?? "--"}
                        <span className="order-edit-meta-dot">•</span>
                        Tạo lúc: {formatDateTime(order?.created_at)}
                      </Text>
                    </Space>
                  </Col>
                  <Col>
                    <Card className="order-edit-rate-card" variant="borderless">
                      <Text className="order-edit-rate-label">Tỷ giá (CNY/VND)</Text>
                      <Title className="order-edit-rate-value" level={5}>
                        3,450 đ
                      </Title>
                    </Card>
                  </Col>
                </Row>

                <Form<OrderEditFormValues>
                  form={form}
                  id="order-edit-form"
                  layout="vertical"
                  onFinish={handleFinish}
                  requiredMark={false}
                >
                  <Row gutter={[24, 24]} align="top">
                    <Col xs={24} xl={16}>
                      <Space orientation="vertical" size={24} style={{ width: "100%" }}>
                        {!canSaveChanges ? (
                          <Alert
                            type="warning"
                            showIcon
                            title="Đơn hàng đang ở chế độ chỉ xem"
                            description="Trạng thái hiện tại không cho phép chỉnh sửa thông tin đơn hàng hoặc mã vận đơn từ màn hình này."
                          />
                        ) : null}
                        {canEditOrderCore ? (
                          <Alert
                            type="info"
                            showIcon
                            title="Bạn đang chỉnh sửa thông tin đơn hàng"
                            description="Ở trạng thái pending, bạn có thể cập nhật khách hàng, thông tin nhận hàng và ghi chú. Mã vận đơn sẽ được quản lý ở giai đoạn logistics."
                          />
                        ) : null}
                        {canEditTracking ? (
                          <Alert
                            type="info"
                            showIcon
                            title="Bạn đang chỉnh sửa mã vận đơn"
                            description="Ở trạng thái này chỉ cho phép cập nhật tracking, phân bổ sản phẩm và ghi chú kiện hàng. Thông tin đơn hàng gốc đã bị khóa."
                          />
                        ) : null}
                        <CustomerPersonnelSection
                          customerOptions={customerOptions}
                          staffOptions={staffOptions}
                          disabled={!canEditOrderCore}
                        />
                        <ReceiverInformationSection
                          shippingMethodOptions={SHIPPING_METHOD_OPTIONS}
                          disabled={!canEditOrderCore}
                        />
                        <ShippingInfoSection
                          disabled={!canEditTracking}
                          orderItems={order?.items ?? []}
                          packagingTypeOptions={PACKAGING_TYPE_OPTIONS}
                          shippingCompanyOptions={SHIPPING_COMPANY_OPTIONS}
                        />
                      </Space>
                    </Col>

                    <Col xs={24} xl={8}>
                      <Space orientation="vertical" size={24} style={{ width: "100%" }}>
                        <NotesSection disabled={!canEditOrderCore} />
                        <AttachmentsSection
                          disabled={!canEditOrderCore}
                          fileList={attachments}
                          onChange={handleAttachmentChange}
                        />
                        <OrderSummaryPanel
                          canConfirm={false}
                          canSave={canSaveChanges}
                          isConfirming={isConfirming}
                          isSaving={isSaving}
                          onConfirm={handleConfirmOrder}
                          orderReference={order?.order_code ?? `#${id}`}
                          saveLabel={canEditTracking ? "Cập nhật mã vận đơn" : "Cập nhật đơn hàng"}
                          statusLabel={getDisplayStatusLabel(order?.status)}
                          totalAmount={order?.total_amount ?? 0}
                        />
                      </Space>
                    </Col>
                  </Row>
                </Form>

                
              </Space>
            </Spin>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};
