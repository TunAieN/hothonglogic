import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { DeleteButton, Show } from "@refinedev/antd";
import { useShow, useUpdate } from "@refinedev/core";
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Empty,
  Grid,
  Image,
  Input,
  List,
  message,
  Modal,
  Popover,
  Result,
  Row,
  Select,
  Space,
  Steps,
  Tag,
  Table,
  Timeline,
  Typography,
} from "antd";
import type { ImageProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import { client, syncGraphqlAuthToken } from "../../providers/graphqlClient";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  DollarCircleOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  HomeOutlined,
  PaperClipOutlined,
  ProfileOutlined,
  ReloadOutlined,
  ShoppingOutlined,
  SyncOutlined,
  TruckOutlined,
  UserOutlined,
  InboxOutlined,
  AppstoreOutlined,
  InfoCircleOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { Link, useParams } from "react-router";
import type { Order as IOrder, OrderItem as IOrderItem } from "../../shared/types";
import {
  OrderConfirmationModal,
  type DepositPolicyPreview,
  type RiskAssessmentEvidence,
  type RiskDepositPolicy,
} from "./components/OrderConfirmationModal";
import { DepositPaymentTrackingModal } from "./components/DepositPaymentTrackingModal";
import { OrderDetailWorkspace } from "./components/OrderDetailWorkspace";
import {
  TaobaoPurchaseConfirmationModal,
  type TaobaoPurchase,
  type TaobaoPurchaseProgress,
} from "./components/TaobaoPurchaseConfirmationModal";
import { getOrderPrimaryAction } from "./orderDetailState";
import {
  formatCny,
  formatVnd,
  hasPositiveMoney,
} from "../../shared/utils/currency";
import "./tracking-manager-modal.css";

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

type StatusMeta = {
  color: string;
  label: string;
};

type TrackingDraft = {
  local_id: string;
  id?: string;
  tracking_number: string;
  carrier?: string | null;
  dispatched_at?: string | null;
  note?: string | null;
  taobao_purchase_order_ids?: string[];
};

const orderJourneySteps = [
  {
    key: "pending",
    title: "Chờ duyệt",
    icon: <ClockCircleOutlined />,
  },
  {
    key: "awaiting_deposit",
    title: "Chờ đặt cọc",
    icon: <DollarCircleOutlined />,
  },
  {
    key: "deposited",
    title: "Đã đặt cọc",
    icon: <CheckCircleOutlined />,
  },
  {
    key: "purchasing",
    title: "Đang đặt hàng",
    icon: <ShoppingOutlined />,
  },
  {
    key: "awaiting_tracking",
    title: "Chờ mã vận đơn",
    icon: <InboxOutlined />,
  },
  {
    key: "waiting_cn_warehouse",
    title: "Chờ kho TQ nhận hàng",
    icon: <TruckOutlined />,
  },
  {
    key: "receiving",
    title: "Đã về kho VN",
    icon: <SyncOutlined />,
  },
  {
    key: "completed",
    title: "Hoàn thành",
    icon: <CheckCircleOutlined />,
  },
] as const;
// order modal

const modalSummaryRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
};

const statusMetaMap: Record<string, StatusMeta> = {
  pending: { color: "blue", label: "Chờ duyệt" },
  awaiting_deposit: { color: "gold", label: "Chờ đặt cọc" },
  deposited: { color: "lime", label: "Đã đặt cọc" },
  purchasing: { color: "cyan", label: "Đang đặt hàng" },
  awaiting_tracking: { color: "geekblue", label: "Chờ mã vận đơn" },
  waiting_cn_warehouse: { color: "purple", label: "Chờ kho TQ nhận hàng" },
  approved: { color: "gold", label: "Đã duyệt" },
  confirmed: { color: "gold", label: "Đã duyệt" },
  deposit: { color: "gold", label: "Đã đặt cọc" },
  shipped: { color: "cyan", label: "Đang vận chuyển" },
  receiving: { color: "cyan", label: "Đang vận chuyển" },
  delivered: { color: "green", label: "Đã giao" },
  completed: { color: "green", label: "Hoàn thành" },
  complaint: { color: "red", label: "Khiếu nại" },
  cancelled: { color: "red", label: "Đã hủy" },
  rejected: { color: "volcano", label: "Đã từ chối" },
};

const carrierOptions = [
  "YTO Express",
  "ZTO Express",
  "Yunda",
  "SF Express",
  "STO Express",
  "Other",
].map((value) => ({ label: value, value }));

const createTrackingLocalId = () =>
  `tracking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildTrackingDrafts = (
  trackings: NonNullable<IOrder["order_trackings"]>,
): TrackingDraft[] =>
  trackings.map((tracking) => ({
    local_id: createTrackingLocalId(),
    id: tracking.id,
    tracking_number: tracking.tracking_number ?? "",
    carrier: tracking.carrier ?? undefined,
    dispatched_at: tracking.dispatched_at ?? null,
    note: tracking.note ?? undefined,
    taobao_purchase_order_ids: tracking.taobao_purchase_orders?.map((purchase) => purchase.id) ?? [],
  }));

const getVariantLabel = (item: Pick<IOrderItem, "size" | "color">) =>
  [item.color, item.size].filter(Boolean).join(" / ") || "-";

const TrackingProductPreview = ({ item }: { item: IOrderItem }) => (
  <div className="tracking-product-preview">
    <div className="tracking-product-preview__image">
      {item.product_image ? (
        <img src={item.product_image} alt="" />
      ) : (
        <ShoppingOutlined />
      )}
    </div>
    <div className="tracking-product-preview__content">
      <strong>{item.product_name || "Sản phẩm chưa có tên"}</strong>
      {item.note ? <p>{item.note}</p> : null}
      <dl>
        <div><dt>Shop</dt><dd>{item.shop_name ?? item.seller ?? "-"}</dd></div>
        <div><dt>Phân loại</dt><dd>{getVariantLabel(item)}</dd></div>
        <div><dt>SKU</dt><dd>{item.id || "-"}</dd></div>
      </dl>
    </div>
  </div>
);

const getTrackingShopSummary = () => "Xác nhận tại kho TQ";

const surfaceCardStyle: CSSProperties = {
  borderRadius: 28,
  border: "1px solid #dbe3f0",
  boxShadow: "0 22px 60px rgba(15, 23, 42, 0.08)",
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,250,255,0.98) 100%)",
};

const mutedTextStyle: CSSProperties = {
  color: "#64748b",
};

const sectionIconWrapStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 12,
  background: "#edf4ff",
  color: "#0b4aa2",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const actionButtonStyle: CSSProperties = {
  height: 42,
  borderRadius: 14,
  fontWeight: 600,
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)",
};

const primaryButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  background: "#0b4aa2",
  borderColor: "#0b4aa2",
};

const infoCardBodyStyle: CSSProperties = {
  padding: 24,
};

const formatDateTime = (value?: string) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const orderSourceLabel = (order?: IOrder) => {
  if (order?.creation_source === "customer_portal") return "Khách hàng tự gửi";
  if (order?.creation_source === "admin_portal") return "Nhân viên tạo";
  return "Đơn lịch sử";
};

const orderCreatorLabel = (order?: IOrder) => {
  if (order?.creation_source === "customer_portal") return "Khách hàng tự gửi";
  return order?.creator?.name || "Không xác định";
};

const formatDateOnly = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("vi-VN");
};

const formatGraphqlDateTime = (value?: string | null) =>
  value ? dayjs(value).startOf("day").format("YYYY-MM-DD HH:mm:ss") : null;

const validateTrackingDrafts = (trackings: TrackingDraft[]) => {
  const trackingNumbers = new Set<string>();

  if (trackings.length === 0) {
    return "Đơn hàng chưa có mã vận đơn nào được khai báo.";
  }

  for (const [index, tracking] of trackings.entries()) {
    const trackingNumber = tracking.tracking_number.trim().toUpperCase();

    if (!trackingNumber) {
      return `Mã vận đơn #${index + 1} chưa có tracking number.`;
    }

    if (trackingNumbers.has(trackingNumber)) {
      return `Tracking number "${trackingNumber}" đang bị trùng trong cùng đơn hàng.`;
    }

    trackingNumbers.add(trackingNumber);
  }

  return null;
};

const getStatusMeta = (status?: string): StatusMeta => {
  if (!status) {
    return { color: "default", label: "Unknown" };
  }

  return (
    statusMetaMap[status.toLowerCase()] ?? {
      color: "default",
      label: status.replace(/_/g, " "),
    }
  );
};

const getJourneyStepIndex = (status?: string) => {
  const normalizedStatus = status?.toLowerCase();

  if (!normalizedStatus) {
    return 0;
  }

  if (normalizedStatus === "approved" || normalizedStatus === "confirmed") {
    return 0;
  }

  if (normalizedStatus === "deposit") {
    return 2;
  }

  if (normalizedStatus === "shipped" || normalizedStatus === "delivered") {
    return 6;
  }

  if (normalizedStatus === "cancelled" || normalizedStatus === "complaint") {
    return 0;
  }

  const currentStep = orderJourneySteps.findIndex(
    (step) => step.key === normalizedStatus,
  );

  return currentStep >= 0 ? currentStep : 0;
};

const getProductSku = (item: IOrderItem, index: number) => {
  const variantParts = [item.size, item.color]
    .map((value) => value?.trim())
    .filter(Boolean);

  if (variantParts.length > 0) {
    return variantParts.join(" | ");
  }

  const productCode = item.product_name
    .split(/\s+/)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())
    .filter(Boolean)
    .slice(0, 3)
    .join("-");

  return productCode ? `SKU-${productCode}` : `SKU-ITEM-${index + 1}`;
};

const ProductThumb = ({ item }: { item: IOrderItem }) => {
  const imageProps: ImageProps = {
    src: item.product_image ?? undefined,
    alt: item.product_name,
    width: 72,
    height: 72,
    style: { objectFit: "cover", borderRadius: 18 },
    preview: false,
    fallback: "",
  };

  if (item.product_image) {
    return <Image {...imageProps} />;
  }

  return (
    <div
      style={{
        width: 72,
        height: 72,
        borderRadius: 18,
        background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
        border: "1px solid #c7d8f8",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <ShoppingOutlined style={{ fontSize: 24, color: "#0b4aa2" }} />
    </div>
  );
};

export const OrderShow = () => {
  const { id } = useParams<{ id: string }>();
  const { query } = useShow<IOrder>({ resource: "orders", id });
  const { data, isLoading, isFetching, isError, error } = query;
  const { mutate: updateOrder, mutateAsync: updateOrderAsync } = useUpdate<IOrder>();
  const [messageApi, contextHolder] = message.useMessage();
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isTrackingManagerOpen, setIsTrackingManagerOpen] = useState(false);
  const [isTaobaoPurchaseModalOpen, setIsTaobaoPurchaseModalOpen] = useState(false);
  const [taobaoPurchaseLoading, setTaobaoPurchaseLoading] = useState(false);
  const [taobaoPurchaseProgress, setTaobaoPurchaseProgress] = useState<TaobaoPurchaseProgress | null>(null);
  const [waiveDeposit, setWaiveDeposit] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState(70);
  const [riskPolicies, setRiskPolicies] = useState<RiskDepositPolicy[]>([]);
  const [riskPoliciesLoading, setRiskPoliciesLoading] = useState(false);
  const [riskPoliciesError, setRiskPoliciesError] = useState<string | null>(null);
  const [depositPolicyPreview, setDepositPolicyPreview] = useState<DepositPolicyPreview | null>(null);
  const [depositPolicyPreviewLoading, setDepositPolicyPreviewLoading] = useState(false);
  const [depositPolicyPreviewError, setDepositPolicyPreviewError] = useState<string | null>(null);
  const [policyReloadKey, setPolicyReloadKey] = useState(0);
  const [riskLevel, setRiskLevel] = useState("");
  const [riskReason, setRiskReason] = useState("");
  const [depositExceptionReason, setDepositExceptionReason] = useState("");
  const [riskEvidence, setRiskEvidence] = useState<RiskAssessmentEvidence>({ seller_checked: false, product_checked: false, returns_checked: false, anomaly_checked: false });
  const [manualDepositAmount, setManualDepositAmount] = useState<number | null>(
    null,
  );
  const [manualDepositCode, setManualDepositCode] = useState("");
  const [manualDepositNote, setManualDepositNote] = useState("");
  const [trackingDrafts, setTrackingDrafts] = useState<TrackingDraft[]>([]);
  const navigateScreens = useBreakpoint();
  const record = data?.data;

  useEffect(() => {
    if (!isConfirmModalOpen) return;
    let active = true;
    setRiskPoliciesLoading(true);
    setRiskPoliciesError(null);
    syncGraphqlAuthToken();
    void client.request<{ riskDepositPolicies: RiskDepositPolicy[] }>(`query RiskDepositPolicies {
      riskDepositPolicies { id code name priority minimum_deposit_percent surcharge_percent requires_manager_approval is_active }
    }`).then((result) => {
      if (active) setRiskPolicies(result.riskDepositPolicies.filter((item) => item.is_active));
    }).catch(() => {
      if (active) {
        setRiskPolicies([]);
        setRiskPoliciesError("Không thể tải danh mục rủi ro đang có hiệu lực.");
      }
    }).finally(() => { if (active) setRiskPoliciesLoading(false); });
    return () => { active = false; };
  }, [isConfirmModalOpen, policyReloadKey]);

  useEffect(() => {
    if (!isConfirmModalOpen || !record?.id) return;
    let active = true;
    setDepositPolicyPreviewLoading(true);
    setDepositPolicyPreviewError(null);
    syncGraphqlAuthToken();
    void client.request<{ orderDepositPolicyPreview: DepositPolicyPreview }>(`query OrderDepositPolicyPreview($order_id: ID!, $risk_level: String) {
      orderDepositPolicyPreview(order_id: $order_id, risk_level: $risk_level) {
        vip_code vip_name qualified_spend_vnd vip_policy_enabled vip_proposed_percent vip_effective_percent
        risk_code risk_name risk_minimum_percent risk_surcharge_percent additive_percent risk_requires_manager_approval capital_minimum_percent
        recommended_percent fallback_percent fallback_applied policy_formula policy_configuration_valid product_total_cny exchange_rate exchange_rate_locked
        product_total_vnd deposit_amount_vnd can_calculate calculation_message can_approve_exception
      }
    }`, { order_id: record.id, risk_level: riskLevel || null }).then((result) => {
      if (active) {
        setDepositPolicyPreview(result.orderDepositPolicyPreview);
        setDepositPercentage(Number(result.orderDepositPolicyPreview.recommended_percent));
      }
    }).catch(() => {
      if (active) {
        setDepositPolicyPreview(null);
        setDepositPolicyPreviewError("Không thể lấy breakdown đặt cọc từ backend. Chưa thể xác nhận đơn.");
      }
    }).finally(() => { if (active) setDepositPolicyPreviewLoading(false); });
    return () => { active = false; };
  }, [isConfirmModalOpen, record?.id, riskLevel, policyReloadKey]);

  const cnPackages = useMemo(
    () => record?.cn_packages ?? [],
    [record?.cn_packages],
  );
  const orderTrackings = useMemo(
    () => record?.order_trackings ?? [],
    [record?.order_trackings],
  );
  const items = useMemo(() => record?.items ?? [], [record?.items]);
  const normalizedOrderStatus = record?.status?.toLowerCase();
  const isTrackingEditable = [
    "awaiting_tracking",
    "waiting_cn_warehouse",
  ].includes(normalizedOrderStatus ?? "");
  const isTrackingReadonly = [
    "receiving",
    "shipped",
    "delivered",
    "completed",
    "cancelled",
  ].includes(normalizedOrderStatus ?? "");
  const currentStepIndex = getJourneyStepIndex(record?.status);
  const statusMeta = getStatusMeta(record?.status);
  const declaredTrackingCount = useMemo(
    () =>
      trackingDrafts.filter(
        (tracking) => tracking.tracking_number.trim().length > 0,
      ).length,
    [trackingDrafts],
  );
  const confirmedItemQuantityById = useMemo(() => {
    const quantityMap = new Map<string, number>();

    cnPackages.forEach((pkg) => {
      (pkg.package_items ?? []).forEach((packageItem) => {
        quantityMap.set(
          packageItem.order_item_id,
          (quantityMap.get(packageItem.order_item_id) ?? 0) +
            Number(packageItem.quantity ?? 0),
        );
      });
    });

    if (quantityMap.size > 0) {
      return quantityMap;
    }

    orderTrackings.forEach((tracking) => {
      (tracking.tracking_items ?? []).forEach((trackingItem) => {
        quantityMap.set(
          trackingItem.order_item_id,
          (quantityMap.get(trackingItem.order_item_id) ?? 0) +
            Number(trackingItem.quantity ?? 0),
        );
      });
    });

    return quantityMap;
  }, [cnPackages, orderTrackings]);
  const allTrackingCodes = useMemo(() => {
    const trackingMap = new Map<
      string,
      {
        trackingNumber: string;
        carrier?: string | null;
        declaredValue?: number | null;
        status?: string | null;
        warehouseName?: string | null;
        createdAt?: string | null;
        shops: string[];
        items: string[];
      }
    >();

    orderTrackings.forEach((tracking) => {
      const trackingNumber = tracking.tracking_number?.trim();

      if (!trackingNumber) {
        return;
      }

      const shops = Array.from(
        new Set(
          (tracking.tracking_items ?? [])
            .map(
              (trackingItem) =>
                trackingItem.order_item?.shop_name ??
                trackingItem.order_item?.seller ??
                trackingItem.order_item?.shop_id ??
                null,
            )
            .filter((value): value is string => Boolean(value)),
        ),
      );

      const itemLabels = (tracking.tracking_items ?? []).map((trackingItem) => {
        const itemName = trackingItem.order_item?.product_name ?? "Sản phẩm";
        return `${itemName} x${trackingItem.quantity ?? 0}`;
      });

      trackingMap.set(trackingNumber.toUpperCase(), {
        trackingNumber,
        carrier: tracking.carrier,
        declaredValue: tracking.declared_value,
        status: tracking.status,
        warehouseName: null,
        createdAt: null,
        shops,
        items: itemLabels,
      });
    });

    cnPackages.forEach((pkg) => {
      const trackingNumber = pkg.tracking_number?.trim();

      if (!trackingNumber) {
        return;
      }

      const key = trackingNumber.toUpperCase();
      const existing = trackingMap.get(key);
      const packageItems = (pkg.package_items ?? []).map((packageItem) => {
        const itemName = packageItem.order_item?.product_name ?? "Sản phẩm";
        return `${itemName} x${packageItem.quantity ?? 0}`;
      });
      const packageShops = Array.from(
        new Set(
          (pkg.order_tracking?.tracking_items ?? [])
            .map(
              (trackingItem) =>
                trackingItem.order_item?.shop_name ??
                trackingItem.order_item?.seller ??
                trackingItem.order_item?.shop_id ??
                null,
            )
            .filter((value): value is string => Boolean(value)),
        ),
      );

      trackingMap.set(key, {
        trackingNumber,
        carrier: pkg.carrier ?? existing?.carrier,
        declaredValue: pkg.declared_value ?? existing?.declaredValue,
        status: pkg.status ?? existing?.status,
        warehouseName: pkg.warehouse?.name ?? existing?.warehouseName,
        createdAt: pkg.received_at ?? pkg.created_at ?? existing?.createdAt,
        shops: Array.from(
          new Set([...(existing?.shops ?? []), ...packageShops]),
        ),
        items: Array.from(
          new Set([...(existing?.items ?? []), ...packageItems]),
        ),
      });
    });

    return Array.from(trackingMap.values());
  }, [cnPackages, orderTrackings]);
  const productSummaryRows = useMemo(
    () =>
      items.map((item, index) => {
        const assignedQuantity = confirmedItemQuantityById.get(item.id) ?? 0;
        const remainingQuantity = Math.max(item.quantity - assignedQuantity, 0);

        return {
          key: item.id,
          image: item.product_image,
          productLink: item.product_link,
          productName: item.product_name,
          sku: getProductSku(item, index),
          shop: item.shop_name ?? item.seller ?? "-",
          variant: getVariantLabel(item),
          orderedQuantity: item.quantity,
          assignedQuantity,
          remainingQuantity,
          unitPrice: item.price_cny,
          subtotal: item.price_cny * item.quantity,
        };
      }),
    [confirmedItemQuantityById, items],
  );
  const remainingSkuCount = useMemo(
    () => productSummaryRows.filter((row) => row.remainingQuantity > 0).length,
    [productSummaryRows],
  );
  const trackingSummaryRows = useMemo(
    () =>
      allTrackingCodes.map((tracking) => {
        const matchedTracking = orderTrackings.find(
          (entry) =>
            entry.tracking_number?.trim().toUpperCase() ===
            tracking.trackingNumber.trim().toUpperCase(),
        );
        const matchedPackage = cnPackages.find(
          (pkg) =>
            pkg.tracking_number?.trim().toUpperCase() ===
            tracking.trackingNumber.trim().toUpperCase(),
        );
        const trackingItems = matchedTracking?.tracking_items ?? [];
        const packageItems = matchedPackage?.package_items ?? [];
        const sourceItems =
          trackingItems.length > 0
            ? trackingItems.map((entry) => ({
                quantity: entry.quantity,
                productName: entry.order_item?.product_name ?? "Sản phẩm",
              }))
            : packageItems.map((entry) => ({
                quantity: entry.quantity,
                productName: entry.order_item?.product_name ?? "Sản phẩm",
              }));

        return {
          key: tracking.trackingNumber,
          trackingNumber: tracking.trackingNumber,
          carrier: tracking.carrier ?? "Chưa cập nhật",
          productCount: sourceItems.length,
          totalQuantity: sourceItems.reduce(
            (sum, item) => sum + item.quantity,
            0,
          ),
          declaredValue: tracking.declaredValue ?? 0,
          note:
            matchedTracking?.note ?? matchedPackage?.note ?? "Không có ghi chú",
          products:
            sourceItems.length > 0
              ? sourceItems
                  .map((item) => `${item.productName} (${item.quantity})`)
                  .join(", ")
              : "Chưa gán sản phẩm",
          createdAt: tracking.createdAt,
        };
      }),
    [allTrackingCodes, cnPackages, orderTrackings],
  );
  const historyTimelineItems = useMemo(() => {
    const events = [
      {
        key: `created-${record?.id ?? "order"}`,
        createdAt: record?.created_at ?? "",
        title: "Tạo đơn hàng",
        description: record?.creator?.name
          ? `Người tạo: ${record.creator.name}`
          : "Đơn hàng đã được tạo.",
      },
      ...orderTrackings.map((tracking) => ({
        key: `tracking-${tracking.id}`,
        createdAt: tracking.dispatched_at ?? record?.created_at ?? "",
        title: `Đã khai báo mã vận đơn ${tracking.tracking_number}`,
        description:
          tracking.note?.trim() ||
          `Đơn vị vận chuyển: ${tracking.carrier ?? "Chưa cập nhật"}`,
      })),
      ...cnPackages.map((pkg) => ({
        key: `package-${pkg.id}`,
        createdAt:
          pkg.received_at ?? pkg.created_at ?? record?.created_at ?? "",
        title: `Kiện ${pkg.tracking_number ?? pkg.id} cập nhật kho`,
        description:
          pkg.warehouse?.name ??
          pkg.status ??
          "Kiện hàng đã được cập nhật trạng thái.",
      })),
    ];

    return events.sort(
      (left, right) =>
        dayjs(right.createdAt).valueOf() - dayjs(left.createdAt).valueOf(),
    );
  }, [
    cnPackages,
    orderTrackings,
    record?.created_at,
    record?.creator?.name,
    record?.id,
  ]);
  const paidStatuses = [
    "deposited",
    "purchasing",
    "awaiting_tracking",
    "waiting_cn_warehouse",
    "receiving",
    "shipped",
    "delivered",
    "completed",
  ];
  const hasPaidDeposit = paidStatuses.includes(normalizedOrderStatus ?? "");
  const productColumns: ColumnsType<(typeof productSummaryRows)[number]> = [
    {
      title: "Sản phẩm",
      dataIndex: "productName",
      key: "productName",
      render: (_, row) => (
        <Space align="start" size={12}>
          <ProductThumb
            item={{
              id: row.key,
              product_name: row.productName,
              product_image: row.image,
              price_cny: row.unitPrice,
              quantity: row.orderedQuantity,
            }}
          />
          <Space direction="vertical" size={2}>
            <Text strong>{row.productName}</Text>
            <Text type="secondary">{row.sku}</Text>
          </Space>
        </Space>
      ),
    },
    {
      title: "Shop",
      dataIndex: "shop",
      key: "shop",
      render: (value) => <Text>{value}</Text>,
    },
    {
      title: "Phân loại",
      dataIndex: "variant",
      key: "variant",
      render: (value) => <Text>{value}</Text>,
    },
    {
      title: "SL đặt",
      dataIndex: "orderedQuantity",
      key: "orderedQuantity",
      align: "center",
      width: 96,
    },
    {
      title: "SL đã gán mã",
      dataIndex: "assignedQuantity",
      key: "assignedQuantity",
      align: "center",
      width: 120,
      render: (value) => <Text strong>{value}</Text>,
    },
    {
      title: "SL còn lại",
      dataIndex: "remainingQuantity",
      key: "remainingQuantity",
      align: "center",
      width: 112,
      render: (value) => (
        <Text strong style={{ color: value > 0 ? "#ef4444" : "#16a34a" }}>
          {value}
        </Text>
      ),
    },
    {
      title: "Đơn giá",
      dataIndex: "unitPrice",
      key: "unitPrice",
      align: "right",
      width: 120,
      render: (value) => <Text>{formatCny(value)}</Text>,
    },
    {
      title: "Thành tiền",
      dataIndex: "subtotal",
      key: "subtotal",
      align: "right",
      width: 132,
      render: (value) => <Text>{formatCny(value)}</Text>,
    },
  ];
  const trackingColumns: ColumnsType<(typeof trackingSummaryRows)[number]> = [
    {
      title: "Mã vận đơn",
      dataIndex: "trackingNumber",
      key: "trackingNumber",
      render: (value) => <Text strong>{value}</Text>,
    },
    {
      title: "Đơn vị vận chuyển",
      dataIndex: "carrier",
      key: "carrier",
    },
    {
      title: "Số lượng sản phẩm",
      dataIndex: "productCount",
      key: "productCount",
      align: "center",
      width: 132,
    },
    {
      title: "Tổng số lượng",
      dataIndex: "totalQuantity",
      key: "totalQuantity",
      align: "center",
      width: 120,
    },
    {
      title: "Giá trị kiện hàng RMB",
      dataIndex: "declaredValue",
      key: "declaredValue",
      align: "right",
      width: 160,
      render: (value) => <Text>{Number(value ?? 0).toFixed(2)}</Text>,
    },
    {
      title: "Ghi chú",
      dataIndex: "note",
      key: "note",
      render: (value) => (
        <Text ellipsis={{ tooltip: value }}>{value || "Không có ghi chú"}</Text>
      ),
    },
    {
      title: "Sản phẩm",
      dataIndex: "products",
      key: "products",
      render: (value) => (
        <Text ellipsis={{ tooltip: value }} style={{ maxWidth: 260 }}>
          {value}
        </Text>
      ),
    },
    {
      title: "Ngày gán",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (value) => <Text>{formatDateTime(value ?? undefined)}</Text>,
    },
  ];

  const itemsSubtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum +
          (hasPositiveMoney(item.subtotal_cny)
            ? Number(item.subtotal_cny)
            : Number(item.price_cny) * Number(item.quantity)),
        0,
      ),
    [items],
  );
  const depositVoucher = record?.depositVoucher;
  const hasDepositVoucher = Boolean(
    depositVoucher?.voucher_type === "deposit" &&
    depositVoucher.total_amount !== null &&
    depositVoucher.total_amount !== undefined &&
    depositVoucher.remaining_amount !== null &&
    depositVoucher.remaining_amount !== undefined,
  );
  const isExchangeRateLocked = Boolean(
    record?.exchange_rate_locked_at || depositVoucher?.exchange_rate,
  );
  // A snapshot alone is not a payable request. Legacy/interrupted records must
  // create or recover their actual deposit voucher first.
  const hasDepositRequest = hasDepositVoucher;
  // Once a voucher exists, its immutable percentage/snapshot is authoritative.
  // The editable preview state defaults to 70% and must never leak into the
  // summary of an already-issued deposit request.
  const displayedDepositPercentage = hasDepositVoucher
    ? Number(
        depositVoucher?.deposit_percent ??
          record?.depositPolicySnapshot?.final_percent ??
          record?.deposit_percent ??
          0,
      )
    : Number(record?.deposit_percent ?? depositPercentage);
  const depositAmount = hasDepositVoucher
    ? Number(depositVoucher?.total_amount ?? 0)
    : hasDepositRequest
      ? Number(record?.deposit_amount_vnd ?? 0)
      : 0;
  const depositRemainingAmount = hasDepositVoucher
    ? Number(depositVoucher?.remaining_amount ?? depositAmount)
    : hasDepositRequest
      ? Number(record?.deposit_remaining_amount_vnd ?? depositAmount)
      : 0;
  const depositDisplay = hasDepositRequest
    ? formatVnd(depositAmount)
    : "Chưa có yêu cầu đặt cọc";
  const zeroPaymentDisplay = isExchangeRateLocked
    ? formatVnd(0)
    : "Chưa chốt tỷ giá";
  const canOpenConfirmModal = normalizedOrderStatus === "pending";
  const canOpenDepositModal = normalizedOrderStatus === "awaiting_deposit";
  const canStartPurchasing = normalizedOrderStatus === "deposited";
  const canConfirmPurchased = normalizedOrderStatus === "purchasing";
  const canManageTrackings = [
    "awaiting_tracking",
    "waiting_cn_warehouse",
  ].includes(normalizedOrderStatus ?? "");
  useEffect(() => {
    if (
      !isDepositModalOpen ||
      !hasDepositRequest ||
      depositRemainingAmount <= 0
    ) {
      return;
    }

    setManualDepositAmount(depositRemainingAmount);
  }, [depositRemainingAmount, hasDepositRequest, isDepositModalOpen]);
  const primaryAction = getOrderPrimaryAction(normalizedOrderStatus);

  const handleUpdateOrderStatus = async (
    nextStatus: string,
    onSuccessCallback?: () => void,
    extraValues: Record<string, unknown> = {},
  ) => {
    if (!record?.id) return;

    setIsUpdatingStatus(true);

    try {
      await updateOrderAsync({
        resource: "orders",
        id: record.id,
        values: { status: nextStatus, ...extraValues },
      });
      await query.refetch();
      onSuccessCallback?.();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "Cập nhật trạng thái đơn hàng thất bại.");
      throw error;
    } finally {
      setIsUpdatingStatus(false);
    }
  };
  const handleConfirmOrder = async () => {
    if (!riskLevel || !riskReason.trim()) {
      messageApi.error("Vui lòng chọn mức rủi ro và nhập lý do đánh giá.");
      return;
    }
    if (!depositPolicyPreview?.can_calculate) {
      messageApi.error("Chưa đủ dữ liệu backend để tính số tiền đặt cọc.");
      return;
    }
    const selectedRiskPolicy = riskPolicies.find((item) => item.code === riskLevel);
    const needsException = waiveDeposit || selectedRiskPolicy?.requires_manager_approval;
    if (needsException && !depositExceptionReason.trim()) {
      messageApi.error("Ngoại lệ đặt cọc cần lý do phê duyệt của quản lý.");
      return;
    }
    const policyValues = {
      risk_level: riskLevel,
      risk_reason: riskReason.trim(),
      risk_evidence: riskEvidence,
      waive_deposit: waiveDeposit,
      exception_reason: depositExceptionReason.trim() || undefined,
    };
    if (!waiveDeposit) {
      if (!record?.id) return;
      setIsUpdatingStatus(true);

      try {
        syncGraphqlAuthToken();

        // 1. Đổi trạng thái đơn hàng sang awaiting_deposit
        await handleUpdateOrderStatus(
          "awaiting_deposit",
          undefined, // Không dùng callback nữa, dùng await bên dưới
          { deposit_percent: depositPercentage, ...policyValues },
        );

        // Backend creates the snapshot and voucher atomically with the status update.
        await query.refetch();
        setIsConfirmModalOpen(false);
        setIsDepositModalOpen(true);
        messageApi.success("Đã chốt tỷ giá và tạo yêu cầu đặt cọc.");
      } catch (error) {
        messageApi.error(
          error instanceof Error
            ? error.message
            : "Không thể khởi tạo yêu cầu đặt cọc.",
        );
      } finally {
        setIsUpdatingStatus(false);
      }
      return;
    }

    // Trường hợp không cần đặt cọc
    await handleUpdateOrderStatus("purchasing", () => {
      setIsConfirmModalOpen(false);
      messageApi.success("Đơn hàng đã chuyển sang trạng thái đang đặt hàng.");
    }, policyValues);
  };

  const handleConfirmDepositPaid = async () => {
    if (!record?.id || !manualDepositAmount || manualDepositAmount <= 0) {
      messageApi.error(
        "Vui lòng nhập số tiền thực nhận lớn hơn 0.",
      );
      return;
    }
    if (manualDepositAmount !== depositRemainingAmount) {
      messageApi.error(
        "Số tiền thực nhận phải bằng toàn bộ số tiền đặt cọc còn phải thanh toán.",
      );
      return;
    }
    if (!manualDepositCode.trim()) {
      messageApi.error(
        "Vui lòng nhập mã giao dịch ngân hàng.",
      );
      return;
    }
    if (manualDepositNote.trim().length < 10) {
      messageApi.error("Vui lòng nhập căn cứ ngân hàng và lý do xác nhận tối thiểu 10 ký tự.");
      return;
    }

    setIsUpdatingStatus(true);
    try {
      syncGraphqlAuthToken();
      await client.request(
        `mutation ConfirmOrderDepositPayment($order_id: ID!, $input: ConfirmOrderDepositPaymentInput!) {
          confirmOrderDepositPayment(order_id: $order_id, input: $input) { id status deposit_paid_amount_vnd deposit_remaining_amount_vnd deposit_status deposit_paid_at }
        }`,
        {
          order_id: record.id,
          input: {
            amount_vnd: manualDepositAmount,
            transaction_code: manualDepositCode.trim(),
            note: manualDepositNote || null,
          },
        },
      );
      await query.refetch();
      setManualDepositAmount(null);
      setManualDepositCode("");
      setManualDepositNote("");
      messageApi.success(
        "Đã xác nhận thanh toán tiền đặt cọc và tạo hóa đơn thành công.",
      );
    } catch (error) {
      messageApi.error(
        error instanceof Error
          ? error.message
          : "Xác nhận tiền cọc thất bại.",
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSendDepositReminder = async () => {
    if (!depositVoucher?.id) return;
    setIsUpdatingStatus(true);
    try {
      syncGraphqlAuthToken();
      await client.request(
        `mutation SendDepositPaymentReminder($payment_voucher_id: ID!) {
          sendDepositPaymentReminder(payment_voucher_id: $payment_voucher_id) { id type status sent_at }
        }`,
        { payment_voucher_id: depositVoucher.id },
      );
      await query.refetch();
      messageApi.success("Đã gửi nhắc thanh toán cho khách hàng.");
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "Không thể gửi nhắc thanh toán.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const isReceivedTracking = (id?: string) => Boolean(id && (record?.cn_packages ?? []).some((pkg) =>
    String(pkg.order_tracking_id) === String(id) && Boolean(pkg.received_at)));

  const updateOrderTrackingPayload = async (
    values: {
      packages?: NonNullable<IOrder["order_trackings"]> | TrackingDraft[];
      status?: string;
    },
    successMessage: string,
    onSuccessCallback?: (
      nextTrackings: NonNullable<IOrder["order_trackings"]>,
    ) => void,
  ) => {
    if (!record?.id) {
      return;
    }

    setIsUpdatingStatus(true);

    const packages = Array.isArray(values.packages)
      ? values.packages.map((tracking) => {
          const trackingDraft =
            "local_id" in tracking
              ? tracking
              : {
                  local_id: createTrackingLocalId(),
                  id: tracking.id,
                  tracking_number: tracking.tracking_number,
                  carrier: tracking.carrier,
                  dispatched_at: tracking.dispatched_at,
                  note: tracking.note,
                  taobao_purchase_order_ids: tracking.taobao_purchase_orders?.map((purchase) => purchase.id) ?? [],
                };

          return {
            id: trackingDraft.id,
            tracking_number: trackingDraft.tracking_number.trim().toUpperCase(),
            carrier: trackingDraft.carrier ?? null,
            dispatched_at: formatGraphqlDateTime(trackingDraft.dispatched_at),
            note: trackingDraft.note?.trim() || null,
            declared_value: 0,
            ...(!isReceivedTracking(trackingDraft.id)
              ? { taobao_purchase_order_ids: trackingDraft.taobao_purchase_order_ids ?? [] }
              : {}),
          };
        })
      : undefined;

    updateOrder(
      {
        resource: "orders",
        id: record.id,
        values: {
          ...(packages ? { packages } : {}),
          ...(values.status ? { status: values.status } : {}),
        },
      },
      {
        onSuccess: async () => {
          const refreshed = await query.refetch();
          const nextTrackings = refreshed.data?.data?.order_trackings ?? [];
          setTrackingDrafts(buildTrackingDrafts(nextTrackings));
          messageApi.success(successMessage);
          setIsUpdatingStatus(false);
          onSuccessCallback?.(nextTrackings);
        },
        onError: (error) => {
          messageApi.error(
            error instanceof Error
              ? error.message
              : "Không thể lưu mã vận đơn.",
          );
          setIsUpdatingStatus(false);
        },
      },
    );
  };

  const addTrackingDraft = () => {
    setTrackingDrafts((current) => [
      ...current,
      {
        local_id: createTrackingLocalId(),
        tracking_number: "",
        carrier: "YTO Express",
        dispatched_at: null,
        note: "",
      },
    ]);
  };

  const removeTrackingDraft = (trackingIndex: number) => {
    setTrackingDrafts((current) =>
      current.filter((_, index) => index !== trackingIndex),
    );
  };

  const updateTrackingDraft = (
    trackingIndex: number,
    field: keyof Omit<TrackingDraft, "local_id" | "id">,
    value: string | string[] | null | undefined,
  ) => {
    setTrackingDrafts((current) =>
      current.map((tracking, index) =>
        index === trackingIndex ? { ...tracking, [field]: value } : tracking,
      ),
    );
  };

  const loadTaobaoPurchaseProgress = async (silent = false) => {
    if (!record?.id) return;
    setTaobaoPurchaseLoading(true);
    try {
      syncGraphqlAuthToken();
      const result = await client.request<{ taobaoPurchaseProgress: TaobaoPurchaseProgress }>(
        `query TaobaoPurchaseProgress($order_id: ID!) {
          taobaoPurchaseProgress(order_id: $order_id) {
            order_id order_status ordered_quantity purchased_quantity remaining_quantity purchase_order_count is_complete
            purchases { id external_order_code shop_id shop_name purchased_at note shop_exception_reason status
              items { id order_item_id quantity order_item { id product_name quantity shop_id shop_name seller size color product_image } }
              trackings { id tracking_number }
            }
          }
        }`,
        { order_id: record.id },
      );
      setTaobaoPurchaseProgress(result.taobaoPurchaseProgress);
    } catch (error) {
      setTaobaoPurchaseProgress(null);
      if (!silent) messageApi.error(error instanceof Error ? error.message : "Không thể tải tiến độ mua Taobao.");
    } finally {
      setTaobaoPurchaseLoading(false);
    }
  };

  const openTrackingManager = () => {
    setTrackingDrafts(buildTrackingDrafts(orderTrackings));
    setIsTrackingManagerOpen(true);
    void loadTaobaoPurchaseProgress();
  };

  const openTaobaoPurchaseModal = () => {
    setIsTaobaoPurchaseModalOpen(true);
    void loadTaobaoPurchaseProgress();
  };

  useEffect(() => {
    if (!record?.id) return;
    void loadTaobaoPurchaseProgress(true);
    // The order id is the persistence boundary; modal actions explicitly reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  const submitTaobaoPurchases = async (purchases: TaobaoPurchase[], confirm: boolean) => {
    if (!record?.id) return;
    syncGraphqlAuthToken();
    const field = confirm ? "confirmTaobaoPurchases" : "saveTaobaoPurchaseProgress";
    const result = await client.request<Record<string, TaobaoPurchaseProgress>>(
      `mutation SaveTaobaoPurchases($order_id: ID!, $input: TaobaoPurchaseProgressInput!) {
        ${field}(order_id: $order_id, input: $input) {
          order_id order_status ordered_quantity purchased_quantity remaining_quantity purchase_order_count is_complete
          purchases { id external_order_code shop_id shop_name purchased_at note shop_exception_reason status
            items { id order_item_id quantity order_item { id product_name quantity shop_id shop_name seller size color product_image } }
            trackings { id tracking_number }
          }
        }
      }`,
      {
        order_id: record.id,
        input: {
          purchases: purchases.map((purchase) => ({
            id: purchase.id,
            external_order_code: purchase.external_order_code.trim(),
            shop_id: purchase.shop_id || null,
            shop_name: purchase.shop_name || null,
            purchased_at: purchase.purchased_at || null,
            note: purchase.note?.trim() || null,
            shop_exception_reason: purchase.shop_exception_reason?.trim() || null,
            items: purchase.items.filter((line) => line.quantity > 0).map((line) => ({ order_item_id: line.order_item_id, quantity: line.quantity })),
          })),
        },
      },
    );
    setTaobaoPurchaseProgress(result[field]);
    messageApi.success(confirm ? "Đã xác nhận đặt đủ hàng và chuyển sang chờ mã vận đơn." : "Đã lưu tiến độ mua hàng; trạng thái đơn vẫn là Đang đặt hàng.");
    await query.refetch();
    if (confirm) setIsTaobaoPurchaseModalOpen(false);
  };

  const handleSaveAllTrackings = () => {
    const validationMessage = validateTrackingDrafts(trackingDrafts);

    if (validationMessage) {
      messageApi.error(validationMessage);
      return;
    }

    updateOrderTrackingPayload(
      { packages: trackingDrafts },
      "Đã lưu danh sách mã vận đơn.",
    );
  };

  const handleMoveToWaitingCnWarehouse = () => {
    const validationMessage = validateTrackingDrafts(trackingDrafts);

    if (validationMessage) {
      messageApi.error(validationMessage);
      return;
    }

    updateOrderTrackingPayload(
      { packages: trackingDrafts, status: "waiting_cn_warehouse" },
      "Đơn hàng đã chuyển sang trạng thái chờ kho Trung Quốc nhận hàng.",
      () => {
        setIsTrackingManagerOpen(false);
      },
    );
  };

  const handlePrimaryAction = () => {
    if (canOpenConfirmModal) {
      setRiskLevel("");
      setRiskReason("");
      setWaiveDeposit(false);
      setDepositExceptionReason("");
      setRiskEvidence({ seller_checked: false, product_checked: false, returns_checked: false, anomaly_checked: false });
      setDepositPolicyPreview(null);
      setIsConfirmModalOpen(true);
      return;
    }

    if (canOpenDepositModal) {
      setIsDepositModalOpen(true);
      return;
    }

    if (canStartPurchasing) {
      handleUpdateOrderStatus("purchasing", () => {
        messageApi.success("Đơn hàng đã chuyển sang trạng thái đang đặt hàng.");
      });
      return;
    }

    if (canConfirmPurchased) {
      openTaobaoPurchaseModal();
      return;
    }

    if (canManageTrackings) {
      openTrackingManager();
    }
  };

  const errorStatusCode =
    error && typeof error === "object" && "statusCode" in error
      ? Number(error.statusCode)
      : undefined;

  if (!id || (!isLoading && errorStatusCode === 404)) {
    return (
      <Card variant="borderless" style={surfaceCardStyle}>
        <Result
          status="404"
          title="Không tìm thấy đơn hàng"
          subTitle={id ? `Không có đơn hàng với ID ${id}.` : "URL không có ID đơn hàng hợp lệ."}
          extra={<Button href="/orders">Quay lại danh sách đơn hàng</Button>}
        />
      </Card>
    );
  }

  if (isLoading || (!record && isFetching)) {
    return (
      <Card variant="borderless" style={surfaceCardStyle}>
        <Result
          status="info"
          title="Đang tải thông tin đơn hàng"
          subTitle={`Đang truy vấn dữ liệu cho đơn hàng ID ${id}.`}
        />
      </Card>
    );
  }

  if (isError || !record) {
    return (
      <Card variant="borderless" style={surfaceCardStyle}>
        <Result
          status="error"
          title="Không thể tải dữ liệu đơn hàng"
          subTitle="GraphQL hoặc kết nối backend đang gặp lỗi. Không có trạng thái nghiệp vụ nào được suy luận từ dữ liệu rỗng."
          extra={
            <Space wrap>
              <Button type="primary" icon={<ReloadOutlined />} onClick={() => void query.refetch()}>
                Thử tải lại
              </Button>
              <Button href="/orders">Quay lại danh sách</Button>
            </Space>
          }
        />
      </Card>
    );
  }

  const renderLegacyLayout = false;

  return (
    <>
      {contextHolder}
      <Show
        breadcrumb={false}
        isLoading={isLoading}
        title={false}
        headerButtons={() => <></>}
        contentProps={{
          style: {
            padding: 0,
            background: "transparent",
            boxShadow: "none",
          },
        }}
      >
        {renderLegacyLayout ? (
        <div
          style={{
            minHeight: "100%",
            background:
              "radial-gradient(circle at top right, rgba(59,130,246,0.08), transparent 30%), #f4f7fb",
          }}
        >
          <Space direction="vertical" size={20} style={{ width: "100%" }}>
            <Card
              variant="borderless"
              style={surfaceCardStyle}
              styles={{ body: { padding: 28 } }}
            >
              <Space direction="vertical" size={20} style={{ width: "100%" }}>
                <Breadcrumb
                  items={[
                    {
                      title: (
                        <Space size={6}>
                          <HomeOutlined />
                          <Link to="/orders">Đơn hàng</Link>
                        </Space>
                      ),
                    },
                    { title: "Chi tiết đơn hàng" },
                  ]}
                />

                <Row gutter={[20, 20]} justify="space-between" align="middle">
                  <Col xs={24} xl={10}>
                    <Space direction="vertical" size={8}>
                      <Space size={12} wrap>
                        <Title
                          level={1}
                          style={{
                            margin: 0,
                            color: "#0f172a",
                            fontSize: navigateScreens.md ? 38 : 30,
                            lineHeight: 1.08,
                          }}
                        >
                          {record?.order_code || "Chi tiết đơn hàng"}
                        </Title>
                        <Tag
                          color={statusMeta.color}
                          style={{
                            borderRadius: 999,
                            padding: "6px 14px",
                            fontWeight: 700,
                            marginInlineEnd: 0,
                          }}
                        >
                          {statusMeta.label}
                        </Tag>
                      </Space>
                      <Text style={{ ...mutedTextStyle, fontSize: 14 }}>
                        Ngày tạo: {formatDateTime(record?.created_at)}{" "}
                        <Text style={mutedTextStyle}>
                          • Tạo bởi: {orderCreatorLabel(record)}
                        </Text>
                      </Text>
                    </Space>
                  </Col>

                  <Col xs={24} xl={14}>
                    <Space
                      size={[12, 12]}
                      wrap
                      style={{
                        width: "100%",
                        justifyContent: navigateScreens.xl
                          ? "flex-end"
                          : "flex-start",
                      }}
                    >
                      <Button
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        style={primaryButtonStyle}
                        loading={isUpdatingStatus}
                        disabled={!primaryAction.enabled}
                        onClick={handlePrimaryAction}
                      >
                        {primaryAction.label}
                      </Button>
                      <Button
                        icon={<InboxOutlined />}
                        style={actionButtonStyle}
                        onClick={openTrackingManager}
                      >
                        Quản lý mã vận đơn
                      </Button>
                      <Button
                        icon={<ReloadOutlined />}
                        style={actionButtonStyle}
                        onClick={() => query.refetch()}
                      >
                        Làm mới
                      </Button>
                      <DeleteButton
                        recordItemId={record?.id}
                        resource="orders"
                        icon={<DeleteOutlined />}
                        disabled={!record?.id}
                        style={{
                          ...actionButtonStyle,
                          color: "#dc2626",
                          borderColor: "#fecaca",
                          background: "#fff",
                        }}
                      >
                        Hủy đơn
                      </DeleteButton>
                    </Space>
                  </Col>
                </Row>
              </Space>
            </Card>

            <Card
              variant="borderless"
              style={surfaceCardStyle}
              styles={{ body: { padding: 24 } }}
            >
              <Steps
                current={currentStepIndex}
                responsive
                items={orderJourneySteps.map((step) => ({
                  title: step.title,
                  icon: step.icon,
                }))}
              />
            </Card>

            <Row gutter={[20, 20]} align="top">
              <Col xs={24} xl={16}>
                <Space direction="vertical" size={20} style={{ width: "100%" }}>
                  <Card
                    variant="borderless"
                    style={surfaceCardStyle}
                    styles={{ body: { padding: 24 } }}
                  >
                    <Space
                      direction="vertical"
                      size={18}
                      style={{ width: "100%" }}
                    >
                      <Space size={12}>
                        <div style={sectionIconWrapStyle}>
                          <UserOutlined />
                        </div>
                        <Title
                          level={4}
                          style={{ margin: 0, color: "#0f172a" }}
                        >
                          Thông tin đơn hàng & khách hàng
                        </Title>
                      </Space>

                      <Descriptions
                        column={navigateScreens.lg ? 2 : 1}
                        colon={false}
                        labelStyle={{ color: "#64748b", width: 180 }}
                        contentStyle={{ color: "#0f172a", fontWeight: 500 }}
                        items={[
                          {
                            key: "customer",
                            label: "Khách hàng",
                            children: record?.customer?.name || "-",
                          },
                          {
                            key: "phone",
                            label: "SĐT",
                            children: record?.customer?.phone || "-",
                          },
                          {
                            key: "email",
                            label: "Email",
                            children: record?.customer?.email || "-",
                          },
                          {
                            key: "address",
                            label: "Địa chỉ nhận hàng",
                            children: record?.customer?.address || "-",
                          },
                          {
                            key: "note",
                            label: "Ghi chú khách hàng",
                            children: record?.note || "Không có",
                          },
                          {
                            key: "source",
                            label: "Nguồn đơn hàng",
                            children: orderSourceLabel(record),
                          },
                        ]}
                      />
                    </Space>
                  </Card>

                  <Card
                    variant="borderless"
                    style={surfaceCardStyle}
                    styles={{ body: { padding: 24 } }}
                  >
                    <Space
                      direction="vertical"
                      size={18}
                      style={{ width: "100%" }}
                    >
                      <Space size={12}>
                        <div style={sectionIconWrapStyle}>
                          <ShoppingOutlined />
                        </div>
                        <Title
                          level={4}
                          style={{ margin: 0, color: "#0f172a" }}
                        >
                          Danh sách sản phẩm
                        </Title>
                      </Space>

                      <Table
                        rowKey="key"
                        dataSource={productSummaryRows}
                        columns={productColumns}
                        pagination={false}
                        scroll={{ x: 980 }}
                        locale={{
                          emptyText: "Chưa có sản phẩm trong đơn hàng.",
                        }}
                        summary={() => (
                          <Table.Summary.Row>
                            <Table.Summary.Cell index={0} colSpan={3}>
                              <Text strong>Tổng cộng</Text>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={1} align="center">
                              <Text strong>
                                {productSummaryRows.reduce(
                                  (sum, row) => sum + row.orderedQuantity,
                                  0,
                                )}
                              </Text>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={2} align="center">
                              <Text strong>
                                {productSummaryRows.reduce(
                                  (sum, row) => sum + row.assignedQuantity,
                                  0,
                                )}
                              </Text>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={3} align="center">
                              <Text
                                strong
                                style={{
                                  color:
                                    remainingSkuCount > 0
                                      ? "#ef4444"
                                      : "#16a34a",
                                }}
                              >
                                {productSummaryRows.reduce(
                                  (sum, row) => sum + row.remainingQuantity,
                                  0,
                                )}
                              </Text>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={4} />
                            <Table.Summary.Cell index={5} align="right">
                              <Text strong>{formatCny(itemsSubtotal)}</Text>
                            </Table.Summary.Cell>
                          </Table.Summary.Row>
                        )}
                      />
                    </Space>
                  </Card>

                  <Card
                    variant="borderless"
                    style={surfaceCardStyle}
                    styles={{ body: { padding: 24 } }}
                  >
                    <Space
                      direction="vertical"
                      size={16}
                      style={{ width: "100%" }}
                    >
                      <Row
                        justify="space-between"
                        align="middle"
                        gutter={[12, 12]}
                      >
                        <Col>
                          <Space size={12}>
                            <div style={sectionIconWrapStyle}>
                              <InboxOutlined />
                            </div>
                            <Title
                              level={4}
                              style={{ margin: 0, color: "#0f172a" }}
                            >
                              Mã vận đơn
                            </Title>
                          </Space>
                        </Col>
                        <Col>
                          <Button
                            icon={<InboxOutlined />}
                            onClick={openTrackingManager}
                          >
                            Quản lý mã vận đơn
                          </Button>
                        </Col>
                      </Row>

                      {items.length > 0 && remainingSkuCount > 0 ? (
                        <Alert
                          type="info"
                          showIcon
                          title={`Kho TQ chua xac nhan ${remainingSkuCount}/${items.length} san pham trong tracking.`}
                        />
                      ) : null}

                      {trackingSummaryRows.length === 0 ? (
                        <Empty description="Chưa có mã vận đơn nào." />
                      ) : (
                        <Table
                          rowKey="key"
                          dataSource={trackingSummaryRows}
                          columns={trackingColumns}
                          pagination={false}
                          scroll={{ x: 1100 }}
                        />
                      )}
                    </Space>
                  </Card>

                  <Row gutter={[20, 20]}>
                    <Col xs={24} lg={12}>
                      <Card
                        variant="borderless"
                        style={surfaceCardStyle}
                        styles={{ body: { padding: 24 } }}
                      >
                        <Space
                          direction="vertical"
                          size={16}
                          style={{ width: "100%" }}
                        >
                          <Space size={12}>
                            <div style={sectionIconWrapStyle}>
                              <FileSearchOutlined />
                            </div>
                            <Title
                              level={4}
                              style={{ margin: 0, color: "#0f172a" }}
                            >
                              Lịch sử đơn hàng
                            </Title>
                          </Space>

                          {historyTimelineItems.length === 0 ? (
                            <Empty description="Chưa có lịch sử đơn hàng." />
                          ) : (
                            <Timeline
                              items={historyTimelineItems.map((entry) => ({
                                children: (
                                  <Space direction="vertical" size={2}>
                                    <Text strong>{entry.title}</Text>
                                    <Text type="secondary">
                                      {formatDateTime(entry.createdAt)}
                                    </Text>
                                    <Text type="secondary">
                                      {entry.description}
                                    </Text>
                                  </Space>
                                ),
                              }))}
                            />
                          )}
                        </Space>
                      </Card>
                    </Col>

                    <Col xs={24} lg={12}>
                      <Card
                        variant="borderless"
                        style={surfaceCardStyle}
                        styles={{ body: { padding: 24 } }}
                      >
                        <Space
                          direction="vertical"
                          size={16}
                          style={{ width: "100%" }}
                        >
                          <Space size={12}>
                            <div style={sectionIconWrapStyle}>
                              <FileTextOutlined />
                            </div>
                            <Title
                              level={4}
                              style={{ margin: 0, color: "#0f172a" }}
                            >
                              Ghi chú nội bộ
                            </Title>
                          </Space>

                          <Input.TextArea
                            value={record?.note ?? ""}
                            readOnly
                            autoSize={{ minRows: 6, maxRows: 8 }}
                            placeholder="Chưa có ghi chú nội bộ."
                          />
                        </Space>
                      </Card>
                    </Col>
                  </Row>
                </Space>
              </Col>

              <Col xs={24} xl={8}>
                <Space direction="vertical" size={20} style={{ width: "100%" }}>
                  <Card
                    variant="borderless"
                    style={surfaceCardStyle}
                    styles={{ body: infoCardBodyStyle }}
                  >
                    <Space
                      direction="vertical"
                      size={16}
                      style={{ width: "100%" }}
                    >
                      <Space size={12}>
                        <div style={sectionIconWrapStyle}>
                          <ProfileOutlined />
                        </div>
                        <Title
                          level={4}
                          style={{ margin: 0, color: "#0f172a" }}
                        >
                          Thông tin tổng quan
                        </Title>
                      </Space>

                      <Descriptions
                        column={1}
                        colon={false}
                        labelStyle={{ color: "#64748b", width: 180 }}
                        contentStyle={{ color: "#0f172a", fontWeight: 500 }}
                        items={[
                          {
                            key: "orderCode",
                            label: "Mã đơn hàng",
                            children: record?.order_code || "-",
                          },
                          {
                            key: "createdAt",
                            label: "Ngày tạo",
                            children: formatDateTime(record?.created_at),
                          },
                          {
                            key: "creator",
                            label: "Nhân viên phụ trách",
                            children: record?.accountManager?.name || "Chưa phân công",
                          },
                          {
                            key: "warehouse",
                            label: "Kho nhận hàng",
                            children:
                              cnPackages[0]?.warehouse?.name ||
                              allTrackingCodes[0]?.warehouseName ||
                              "Chưa cập nhật",
                          },
                          {
                            key: "shippingMethod",
                            label: "Phương thức vận chuyển dự kiến",
                            children: "Chưa cập nhật",
                          },
                        ]}
                      />
                    </Space>
                  </Card>

                  <Card
                    variant="borderless"
                    style={surfaceCardStyle}
                    styles={{ body: infoCardBodyStyle }}
                  >
                    <Space
                      direction="vertical"
                      size={16}
                      style={{ width: "100%" }}
                    >
                      <Space size={12}>
                        <div style={sectionIconWrapStyle}>
                          <DollarCircleOutlined />
                        </div>
                        <Title
                          level={4}
                          style={{ margin: 0, color: "#0f172a" }}
                        >
                          Thanh toán
                        </Title>
                      </Space>

                      <Space
                        direction="vertical"
                        size={12}
                        style={{ width: "100%" }}
                      >
                        <div style={modalSummaryRowStyle}>
                          <Text style={mutedTextStyle}>
                            Tạm tính ({items.length} sản phẩm)
                          </Text>
                          <Text strong>{formatCny(itemsSubtotal)}</Text>
                        </div>
                        <div style={modalSummaryRowStyle}>
                          <Text style={mutedTextStyle}>Phí dịch vụ</Text>
                          <Text strong>{formatCny(0)}</Text>
                        </div>
                        <div style={modalSummaryRowStyle}>
                          <Text style={mutedTextStyle}>
                            Phí vận chuyển dự kiến
                          </Text>
                          <Text strong>{formatCny(0)}</Text>
                        </div>
                        <div style={modalSummaryRowStyle}>
                          <Text style={mutedTextStyle}>
                            Đặt cọc ({displayedDepositPercentage}%)
                          </Text>
                          <Text strong style={{ color: "#2563eb" }}>
                            {depositDisplay}
                          </Text>
                        </div>
                        <Divider
                          style={{ margin: "2px 0", borderColor: "#e7edf6" }}
                        />
                        <div style={modalSummaryRowStyle}>
                          <Text style={mutedTextStyle}>Đã thanh toán</Text>
                          <Text strong style={{ color: "#16a34a" }}>
                            {hasPaidDeposit
                              ? depositDisplay
                              : zeroPaymentDisplay}
                          </Text>
                        </div>
                        <div style={modalSummaryRowStyle}>
                          <Text style={mutedTextStyle}>
                            Còn lại phải thanh toán
                          </Text>
                          <Text strong style={{ color: "#ef4444" }}>
                            {hasPaidDeposit
                              ? zeroPaymentDisplay
                              : depositDisplay}
                          </Text>
                        </div>
                      </Space>
                    </Space>
                  </Card>

                  <Card
                    variant="borderless"
                    style={surfaceCardStyle}
                    styles={{ body: infoCardBodyStyle }}
                  >
                    <Space
                      direction="vertical"
                      size={16}
                      style={{ width: "100%" }}
                    >
                      <Space size={12}>
                        <div style={sectionIconWrapStyle}>
                          <CheckCircleOutlined />
                        </div>
                        <Title
                          level={4}
                          style={{ margin: 0, color: "#0f172a" }}
                        >
                          Trạng thái thanh toán
                        </Title>
                      </Space>

                      <Row justify="space-between" align="middle">
                        <Text style={mutedTextStyle}>Trạng thái</Text>
                        <Tag
                          color={hasPaidDeposit ? "green" : "gold"}
                          style={{
                            borderRadius: 999,
                            marginInlineEnd: 0,
                            padding: "4px 12px",
                          }}
                        >
                          {hasPaidDeposit ? "Đã đặt cọc" : "Chờ đặt cọc"}
                        </Tag>
                      </Row>

                      <Descriptions
                        column={1}
                        colon={false}
                        labelStyle={{ color: "#64748b", width: 150 }}
                        contentStyle={{ color: "#0f172a", fontWeight: 500 }}
                        items={[
                          {
                            key: "paidAt",
                            label: "Đặt cọc lúc",
                            children: hasPaidDeposit
                              ? formatDateTime(record?.created_at)
                              : "Chưa cập nhật",
                          },
                          {
                            key: "method",
                            label: "Phương thức",
                            children: hasPaidDeposit
                              ? "Xác nhận nội bộ"
                              : "Chưa cập nhật",
                          },
                        ]}
                      />
                    </Space>
                  </Card>

                  <Card
                    variant="borderless"
                    style={surfaceCardStyle}
                    styles={{ body: infoCardBodyStyle }}
                  >
                    <Space
                      direction="vertical"
                      size={16}
                      style={{ width: "100%" }}
                    >
                      <Space size={12}>
                        <div style={sectionIconWrapStyle}>
                          <PaperClipOutlined />
                        </div>
                        <Title
                          level={4}
                          style={{ margin: 0, color: "#0f172a" }}
                        >
                          Tệp đính kèm
                        </Title>
                      </Space>

                      <List
                        dataSource={[]}
                        locale={{
                          emptyText: (
                            <Empty description="Chưa có tệp đính kèm." />
                          ),
                        }}
                        renderItem={() => null}
                      />
                    </Space>
                  </Card>
                </Space>
              </Col>
            </Row>
          </Space>
        </div>
        ) : (
          <OrderDetailWorkspace
            order={record}
            statusMeta={statusMeta}
            currentStep={currentStepIndex}
            journeySteps={orderJourneySteps}
            primaryAction={primaryAction}
            updating={isUpdatingStatus}
            productRows={productSummaryRows}
            trackingRows={trackingSummaryRows}
            historyEntries={historyTimelineItems}
            itemsSubtotal={itemsSubtotal}
            depositPercent={displayedDepositPercentage}
            depositAmount={depositAmount}
            depositRemainingAmount={depositRemainingAmount}
            hasDepositRequest={hasDepositRequest}
            hasPaidDeposit={hasPaidDeposit}
            sourceLabel={orderSourceLabel(record)}
            creatorLabel={orderCreatorLabel(record)}
            formatDateTime={formatDateTime}
            onPrimaryAction={handlePrimaryAction}
            onManageTracking={openTrackingManager}
            onRefresh={() => { void query.refetch(); }}
            onOpenDeposit={() => setIsDepositModalOpen(true)}
            taobaoProgress={taobaoPurchaseProgress}
            onOpenTaobaoPurchases={openTaobaoPurchaseModal}
          />
        )}
      </Show>
      <OrderConfirmationModal
        open={isConfirmModalOpen}
        order={record}
        loading={isUpdatingStatus}
        policies={riskPolicies}
        policiesLoading={riskPoliciesLoading}
        policiesError={riskPoliciesError}
        preview={depositPolicyPreview}
        previewLoading={depositPolicyPreviewLoading}
        previewError={depositPolicyPreviewError}
        riskLevel={riskLevel}
        riskReason={riskReason}
        waiveDeposit={waiveDeposit}
        exceptionReason={depositExceptionReason}
        evidence={riskEvidence}
        onRiskLevelChange={setRiskLevel}
        onRiskReasonChange={setRiskReason}
        onWaiveDepositChange={setWaiveDeposit}
        onExceptionReasonChange={setDepositExceptionReason}
        onEvidenceChange={(key, value) => setRiskEvidence((current) => ({ ...current, [key]: value }))}
        onRetry={() => setPolicyReloadKey((value) => value + 1)}
        onCancel={() => setIsConfirmModalOpen(false)}
        onConfirm={handleConfirmOrder}
      />
      <DepositPaymentTrackingModal
        open={isDepositModalOpen}
        order={record}
        loading={isUpdatingStatus}
        manualAmount={manualDepositAmount}
        manualCode={manualDepositCode}
        manualReason={manualDepositNote}
        onManualAmountChange={setManualDepositAmount}
        onManualCodeChange={setManualDepositCode}
        onManualReasonChange={setManualDepositNote}
        onManualConfirm={handleConfirmDepositPaid}
        onReminder={handleSendDepositReminder}
        onRefresh={() => { void query.refetch(); }}
        onClose={() => setIsDepositModalOpen(false)}
      />
      <TaobaoPurchaseConfirmationModal
        open={isTaobaoPurchaseModalOpen}
        order={record}
        progress={taobaoPurchaseProgress}
        loading={taobaoPurchaseLoading}
        onClose={() => setIsTaobaoPurchaseModalOpen(false)}
        onSubmit={submitTaobaoPurchases}
      />
      <Modal
        open={isTrackingManagerOpen}
        onCancel={() => setIsTrackingManagerOpen(false)}
        width={1180}
        destroyOnHidden={false}
        centered
        title={null}
        className="tracking-manager-modal"
        footer={
          <footer className="tracking-manager-modal__footer">
            {isTrackingEditable && normalizedOrderStatus === "awaiting_tracking" ? (
              <Button
                type="primary"
                ghost
                icon={<InboxOutlined />}
                disabled={declaredTrackingCount === 0}
                loading={isUpdatingStatus}
                onClick={handleMoveToWaitingCnWarehouse}
              >
                Chuyển sang chờ kho TQ nhận hàng
              </Button>
            ) : <span />}
            <div className="tracking-manager-modal__footer-actions">
              <Button onClick={() => setIsTrackingManagerOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={isUpdatingStatus}
                disabled={!isTrackingEditable}
                onClick={handleSaveAllTrackings}
              >
                Lưu tất cả
              </Button>
            </div>
          </footer>
        }
      >
        <header className="tracking-manager-modal__header">
          <span className="tracking-manager-modal__header-icon"><TruckOutlined /></span>
          <h2>Quản lý mã vận đơn - Đơn hàng {record?.order_code ?? "-"}</h2>
        </header>

        <div className="tracking-manager-modal__body">
          <section className="tracking-manager-modal__overview">
            <div className="tracking-manager-modal__order">
              <span className="tracking-manager-modal__order-icon"><FileTextOutlined /></span>
              <div><small>Mã đơn hàng</small><strong title={record?.order_code ?? "-"}>{record?.order_code ?? "-"}</strong></div>
              <p><UserOutlined /> Khách hàng: <b>{record?.customer?.name ?? "-"}</b></p>
              <p><ClockCircleOutlined /> Ngày đặt: {formatDateOnly(record?.created_at)}</p>
            </div>
            <div className="tracking-manager-modal__metrics">
              <div className="tracking-manager-modal__metric">
                <span><AppstoreOutlined /></span><small>Tổng SKU</small><strong>{items.length}</strong>
              </div>
              <div className="tracking-manager-modal__metric tracking-manager-modal__metric--success">
                <span><TruckOutlined /></span><small>Đã khai báo tracking</small><strong>{declaredTrackingCount}</strong>
              </div>
              <div className="tracking-manager-modal__metric tracking-manager-modal__metric--warning">
                <span><InboxOutlined /></span><small>Chờ kho TQ xác nhận item</small><strong>{remainingSkuCount}</strong>
              </div>
            </div>
            <aside className="tracking-manager-modal__notice">
              <span><InfoCircleOutlined /></span>
              <div><strong>Lưu ý</strong><p>Bước này chỉ khai báo mã vận đơn thuộc đơn hàng. Item bên trong sẽ được kho Trung Quốc xác nhận sau.</p></div>
            </aside>
          </section>

          <div className="tracking-manager-modal__columns">
            <section className="tracking-manager-modal__panel">
              <header className="tracking-manager-modal__panel-header">
                <h3><AppstoreOutlined />1. Sản phẩm trong đơn ({items.length})</h3>
              </header>
              <div className="tracking-manager-modal__panel-body">
                {items.length === 0 ? (
                  <div className="tracking-manager-modal__empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Đơn hàng chưa có sản phẩm." /></div>
                ) : (
                  <>
                    <Alert type="info" showIcon message="Danh sách sản phẩm của đơn được gửi về kho Trung Quốc để đối chiếu sau khi nhận hàng." />
                    <div className="tracking-products-scroll">
                      <Table
                        className="tracking-products-table"
                        size="small"
                        pagination={false}
                        rowKey="key"
                        tableLayout="fixed"
                        dataSource={items.map((item, index) => ({
                          key: item.id,
                          index: index + 1,
                          item,
                          shop: item.shop_name ?? item.seller ?? "-",
                          variant: getVariantLabel(item),
                          quantity: item.quantity,
                        }))}
                        columns={[
                          { title: "#", dataIndex: "index", width: 36, align: "center" as const },
                          {
                            title: "Sản phẩm",
                            dataIndex: "item",
                            key: "product",
                            render: (item: IOrderItem) => (
                              <div className="tracking-product-cell">
                                <Popover
                                  overlayClassName="tracking-product-popover"
                                  content={<TrackingProductPreview item={item} />}
                                  trigger={["hover", "focus", "click"]}
                                  placement="bottomLeft"
                                  mouseEnterDelay={0.15}
                                >
                                  <button type="button" className="tracking-product-cell__trigger" aria-label={`Xem chi tiết ${item.product_name}`}>
                                    <span className="tracking-product-cell__image">
                                      {item.product_image ? <img src={item.product_image} alt="" /> : <ShoppingOutlined />}
                                    </span>
                                    <span className="tracking-product-cell__name" title={item.product_name}>{item.product_name || "Sản phẩm chưa có tên"}</span>
                                  </button>
                                </Popover>
                              </div>
                            ),
                          },
                          { title: "Shop", dataIndex: "shop", key: "shop", width: 100, render: (value: string) => <span className="tracking-table-ellipsis" title={value}>{value}</span> },
                          { title: "Phân loại", dataIndex: "variant", key: "variant", width: 82, render: (value: string) => <span className="tracking-table-ellipsis" title={value}>{value}</span> },
                          { title: "SL", dataIndex: "quantity", key: "quantity", width: 45, align: "center" as const },
                        ]}
                      />
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="tracking-manager-modal__panel">
              <header className="tracking-manager-modal__panel-header">
                <h3><TruckOutlined />2. Danh sách mã vận đơn</h3>
                <Button type="primary" onClick={addTrackingDraft} disabled={!isTrackingEditable}>+ Thêm mã vận đơn khác</Button>
              </header>
              <div className="tracking-manager-modal__panel-body">
                {trackingDrafts.length === 0 ? (
                  <div className="tracking-manager-modal__empty">
                    <div>
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={<><strong>Chưa có mã vận đơn nào</strong><span>Hãy thêm mã vận đơn đầu tiên để quản lý vận chuyển.</span></>}
                      />
                      <Button type="primary" onClick={addTrackingDraft} disabled={!isTrackingEditable}>+ Thêm mã vận đơn</Button>
                    </div>
                  </div>
                ) : (
                  <div className="tracking-manager-modal__list">
                    {trackingDrafts.map((tracking, trackingIndex) => (
                      <Card
                        className="tracking-manager-modal__tracking-card"
                        key={tracking.local_id}
                        size="small"
                        title={`Mã vận đơn #${trackingIndex + 1}`}
                        extra={<Button danger type="text" disabled={!isTrackingEditable || isReceivedTracking(tracking.id)} onClick={() => removeTrackingDraft(trackingIndex)}>Xóa mã này</Button>}
                      >
                        <Row gutter={[10, 10]}>
                          <Col xs={24} md={10}>
                            <Text>Mã vận đơn *</Text>
                            <Input value={tracking.tracking_number} disabled={!isTrackingEditable || isReceivedTracking(tracking.id)} onChange={(event) => updateTrackingDraft(trackingIndex, "tracking_number", event.target.value.toUpperCase())} placeholder="VD: YD123456789CN" />
                          </Col>
                          <Col xs={24} md={7}>
                            <Text>Đơn vị vận chuyển *</Text>
                            <Select style={{ width: "100%" }} value={tracking.carrier ?? undefined} disabled={!isTrackingEditable} options={carrierOptions} onChange={(value) => updateTrackingDraft(trackingIndex, "carrier", value)} placeholder="Chọn đơn vị" />
                          </Col>
                          <Col xs={24} md={7}>
                            <Text>Shop / người bán</Text>
                            <Input value={getTrackingShopSummary()} disabled />
                          </Col>
                          <Col xs={24} md={7}>
                            <Text>Ngày phát hàng</Text>
                            <DatePicker style={{ width: "100%" }} value={tracking.dispatched_at ? dayjs(tracking.dispatched_at) : null} disabled={!isTrackingEditable} format="DD/MM/YYYY" onChange={(value) => updateTrackingDraft(trackingIndex, "dispatched_at", value ? value.startOf("day").format("YYYY-MM-DD HH:mm:ss") : null)} />
                          </Col>
                          <Col xs={24} md={17}>
                            <Text>Ghi chú</Text>
                            <Input.TextArea rows={2} value={tracking.note ?? ""} disabled={!isTrackingEditable} onChange={(event) => updateTrackingDraft(trackingIndex, "note", event.target.value)} placeholder="Ví dụ: Shop đóng gói cẩn thận" />
                          </Col>
                          <Col xs={24}>
                            <Text>Các đơn mua Taobao liên quan (không bắt buộc)</Text>
                            <Select
                              mode="multiple"
                              allowClear
                              style={{ width: "100%" }}
                              value={tracking.taobao_purchase_order_ids ?? []}
                              disabled={!isTrackingEditable || isReceivedTracking(tracking.id)}
                              options={(taobaoPurchaseProgress?.purchases ?? []).map((purchase) => ({
                                value: String(purchase.id),
                                label: `${purchase.external_order_code}${purchase.shop_name ? ` · ${purchase.shop_name}` : ""}`,
                              }))}
                              onChange={(value) => updateTrackingDraft(trackingIndex, "taobao_purchase_order_ids", value)}
                              placeholder="Chọn một hoặc nhiều đơn mua đã xác minh"
                            />
                            {!tracking.taobao_purchase_order_ids?.length &&
                              <Text type="secondary">Chưa xác định đơn mua Taobao — có thể đối chiếu sau.</Text>}
                            {isReceivedTracking(tracking.id) &&
                              <div><Text type="secondary">Đã tiếp nhận vào kho. Xác minh nguồn mua tại Kho Trung Quốc.</Text></div>}
                          </Col>
                        </Row>
                        <div className="tracking-manager-modal__tracking-hint"><InfoCircleOutlined /> Item trong tracking này chưa được xác định ở bước khai báo. Kho Trung Quốc sẽ xác nhận sau khi nhận hàng thực tế.</div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          {isTrackingEditable ? (
            <section className="tracking-manager-modal__warehouse-note">
              <span><InfoCircleOutlined /></span>
              <div><strong>Bước xác nhận item được thực hiện tại kho Trung Quốc</strong><p>Tại đây chỉ lưu danh sách tracking của đơn. Sau khi hàng về kho Trung Quốc, nhân viên sẽ đối chiếu và xác nhận item trong từng tracking.</p></div>
            </section>
          ) : null}

          {isTrackingReadonly ? (
            <section className="tracking-manager-modal__warehouse-note">
              <span><InfoCircleOutlined /></span>
              <div><strong>Đơn hàng đang ở chế độ chỉ xem</strong><p>Đơn hàng đã ở trạng thái không còn cho phép chỉnh sửa mã vận đơn.</p></div>
            </section>
          ) : null}
        </div>
      </Modal>
    </>
  );
};
