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
    background: #f7f5f2;
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
    background: #faf8f4;
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
    padding: 18px 34px 36px;
  }

  .order-edit-breadcrumb,
  .order-edit-breadcrumb a {
    color: #6b7280 !important;
    font-size: 13px;
  }

  .order-edit-page-title {
    color: #081a43 !important;
    font-size: 42px !important;
    font-weight: 800 !important;
    letter-spacing: -0.03em;
    margin: 4px 0 0 !important;
  }

  .order-edit-rate-card.ant-card {
    background: #f3efea;
    border: 0;
    border-radius: 16px;
    box-shadow: none;
  }

  .order-edit-rate-card .ant-card-body {
    padding: 14px 18px;
    text-align: center;
  }

  .order-edit-rate-label {
    color: #6b7280;
    font-size: 12px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .order-edit-rate-value {
    color: #108d4f !important;
    font-size: 20px !important;
    font-weight: 800 !important;
    line-height: 1;
    margin-top: 4px;
  }

  .order-edit-section-card.ant-card,
  .order-edit-summary-card.ant-card,
  .order-edit-context-card.ant-card {
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid #efe9e2;
    border-radius: 30px;
    box-shadow: 0 12px 32px rgba(31, 41, 55, 0.06);
  }

  .order-edit-section-card .ant-card-body,
  .order-edit-context-card .ant-card-body {
    padding: 26px;
  }

  .order-edit-section-head {
    align-items: center;
    display: flex;
    justify-content: space-between;
  }

  .order-edit-section-title.ant-typography {
    color: #0a1f55;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .order-edit-page-body .ant-form-item {
    margin-bottom: 18px;
  }

  .order-edit-page-body .ant-form-item-label > label {
    color: #111827;
    font-size: 14px;
    font-weight: 500;
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
    background: #f0edeb !important;
    border-color: transparent !important;
    border-radius: 14px !important;
    box-shadow: none !important;
  }

  .order-edit-page-body .ant-input,
  .order-edit-page-body .ant-select-selector,
  .order-edit-page-body .ant-input-number,
  .order-edit-page-body .ant-input-affix-wrapper {
    min-height: 48px;
  }

  .order-edit-page-body .ant-select-selector {
    padding-top: 8px !important;
  }

  .order-edit-page-body textarea.ant-input {
    min-height: 152px;
    padding-top: 14px;
  }

  .order-edit-tip-banner {
    background: #f4efe7;
    border-left: 4px solid #ffb300;
    border-radius: 10px;
    color: #d98d00;
    font-size: 14px;
    line-height: 1.55;
    padding: 12px 16px;
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
    background: #e3f4eb;
    border: 0;
    border-radius: 12px;
    color: #137d4d;
    font-weight: 600;
    width: fit-content;
  }

  .order-edit-muted-note {
    font-size: 13px;
  }

  .order-edit-section-card .ant-upload-wrapper .ant-upload-drag {
    background: #fff;
    border: 2px dashed #d8dce6;
    border-radius: 20px;
    min-height: 190px;
    padding: 22px 18px;
  }

  .order-edit-upload-title {
    color: #111827;
    font-size: 18px;
    font-weight: 500;
    margin-bottom: 6px;
  }

  .order-edit-summary-card.ant-card {
    background: linear-gradient(180deg, #091d4b 0%, #081936 100%);
    color: #fff;
    overflow: hidden;
    position: sticky;
    top: 112px;
  }

  .order-edit-summary-card .ant-card-body {
    padding: 26px;
  }

  .order-edit-summary-kicker {
    color: #9fb3da;
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .order-edit-summary-row {
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    display: flex;
    justify-content: space-between;
    padding-bottom: 14px;
  }

  .order-edit-summary-row .ant-typography,
  .order-edit-summary-row .ant-badge {
    color: #fff;
  }

  .order-edit-live-badge {
    background: #fff;
    border-radius: 999px;
    color: #0f172a;
    display: inline-block;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.16em;
    padding: 10px 14px;
  }

  .order-edit-confirm-button,
  .order-edit-update-button {
    border-radius: 14px;
    font-size: 18px;
    font-weight: 700;
    height: 58px;
  }

  .order-edit-confirm-button {
    background: #0e8f4f;
    border-color: #0e8f4f;
  }

  .order-edit-update-button {
    border: 0;
    color: #0b1533;
  }

  .order-edit-context-label {
    color: #98a1b2;
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .order-edit-context-map {
    background:
      linear-gradient(180deg, rgba(247, 245, 242, 0.18), rgba(247, 245, 242, 0.88)),
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

const isOrderEditable = (status?: string) => status?.toLowerCase() === "pending";

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
  const isEditable = isOrderEditable(order?.status);
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
      order.cn_packages && order.cn_packages.length > 0
        ? order.cn_packages.map((pkg, index) => mapPackageToShippingEntry(pkg, meta.shippingEntries?.[index]))
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
    if (!selectedCustomer) {
      return;
    }

    form.setFieldsValue({
      receiverName: selectedCustomer.name || "",
      receiverPhone: selectedCustomer.phone || "",
      receiverAddress: selectedCustomer.address || "",
    });
  }, [form, selectedCustomer]);

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

  const submitOrder = async (values: OrderEditFormValues, nextStatus?: string) => {
    if (!order?.id || !isEditable) {
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

  const handleFinish = async (values: OrderEditFormValues) => {
    if (!isEditable) {
      return;
    }

    setIsSaving(true);

    try {
      await submitOrder(values);
      message.success("Đơn hàng đã được cập nhật.");
      await query.refetch();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không thể cập nhật đơn hàng.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (!isEditable) {
      return;
    }

    try {
      setIsConfirming(true);
      const values = await form.validateFields();
      await submitOrder(values, "approved");
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
              <Space direction="vertical" size={28} style={{ width: "100%" }}>
                <Row justify="space-between" align="middle" gutter={[16, 16]}>
                  <Col>
                    <Space direction="vertical" size={10}>
                      <Breadcrumb
                        className="order-edit-breadcrumb"
                        items={[
                          { title: "Orders" },
                          { title: order?.order_code ?? `#${id}` },
                        ]}
                      />
                      <Title className="order-edit-page-title" level={1}>
                        Sửa đơn hàng #{id}
                      </Title>
                    </Space>
                  </Col>
                  <Col>
                    <Card className="order-edit-rate-card" bordered={false}>
                      <Text className="order-edit-rate-label">Rate (CNY/VND)</Text>
                      <Title className="order-edit-rate-value" level={5}>
                        3,450 đ
                      </Title>
                    </Card>
                  </Col>
                </Row>

                <Form<OrderEditFormValues>
                  disabled={!isEditable}
                  form={form}
                  id="order-edit-form"
                  layout="vertical"
                  onFinish={handleFinish}
                  requiredMark={false}
                >
                  <Row gutter={[24, 24]} align="top">
                    <Col xs={24} xl={16}>
                      <Space direction="vertical" size={24} style={{ width: "100%" }}>
                        {!isEditable ? (
                          <Alert
                            type="warning"
                            showIcon
                            message="Don hang da bi khoa chinh sua"
                            description="Chi don hang o trang thai PENDING moi duoc cap nhat. Cac trang thai APPROVED, SHIPPED, DELIVERED va CANCELLED chi duoc xem."
                          />
                        ) : null}
                        <CustomerPersonnelSection
                          customerOptions={customerOptions}
                          staffOptions={staffOptions}
                        />
                        <ReceiverInformationSection
                          shippingMethodOptions={SHIPPING_METHOD_OPTIONS}
                        />
                        <ShippingInfoSection
                          orderItems={order?.items ?? []}
                          packagingTypeOptions={PACKAGING_TYPE_OPTIONS}
                          shippingCompanyOptions={SHIPPING_COMPANY_OPTIONS}
                        />
                      </Space>
                    </Col>

                    <Col xs={24} xl={8}>
                      <Space direction="vertical" size={24} style={{ width: "100%" }}>
                        <NotesSection />
                        <AttachmentsSection
                          fileList={attachments}
                          onChange={handleAttachmentChange}
                        />
                        <OrderSummaryPanel
                          isConfirming={isConfirming}
                          isEditable={isEditable}
                          isSaving={isSaving}
                          onConfirm={handleConfirmOrder}
                          orderReference={order?.order_code ?? `#${id}`}
                          statusLabel={getStatusLabel(order?.status)}
                          totalAmount={order?.total_amount ?? 0}
                        />
                      </Space>
                    </Col>
                  </Row>
                </Form>

                <Card className="order-edit-context-card" bordered={false}>
                  <Text className="order-edit-context-label">
                    Network Context: Hanoi - Logistics Hub
                  </Text>
                  <div className="order-edit-context-map" />
                </Card>
              </Space>
            </Spin>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};
