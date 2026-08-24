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
import { fetchDefaultPaymentAccount } from "../payment-vouchers/api";
import { client, syncGraphqlAuthToken } from "../../providers/graphqlClient";
import type { PaymentAccount } from "../payment-vouchers/types";
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
} from "@ant-design/icons";
import dayjs from "dayjs";
import { Link } from "react-router";
import { Modal, Radio, InputNumber } from "antd";
import type { IOrder, IOrderItem } from "../../interfaces";
import {
  formatCny,
  formatVnd,
  hasPositiveMoney,
  resolveLegacyCnyTotal,
} from "../../utils/currency";

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

const optionCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  background: "#fff",
};

const bankInfoStyle: CSSProperties = {
  border: "1px solid #f5d7a1",
  background: "#fff7e8",
  borderRadius: 12,
  padding: 16,
};

const modalSummaryRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
};

const summaryBlockStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
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
  }));

const getVariantLabel = (item: Pick<IOrderItem, "size" | "color">) =>
  [item.color, item.size].filter(Boolean).join(" / ") || "-";

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
  const { query } = useShow<IOrder>();
  const { data, isLoading } = query;
  const { mutate: updateOrder } = useUpdate<IOrder>();
  const [messageApi, contextHolder] = message.useMessage();
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isTrackingManagerOpen, setIsTrackingManagerOpen] = useState(false);
  const [depositOpions, setDepositOptions] = useState<"deposit" | "no_deposit">(
    "deposit",
  );
  const [depositPercentage, setDepositPercentage] = useState(70);
  const [manualDepositAmount, setManualDepositAmount] = useState<number | null>(
    null,
  );
  const [manualDepositCode, setManualDepositCode] = useState("");
  const [manualDepositNote, setManualDepositNote] = useState("");
  const [trackingDrafts, setTrackingDrafts] = useState<TrackingDraft[]>([]);
  const [defaultPaymentAccount, setDefaultPaymentAccount] =
    useState<PaymentAccount | null>(null);
  const navigateScreens = useBreakpoint();
  const record = data?.data;
  useEffect(() => {
    if (!isDepositModalOpen) {
      return;
    }

    void fetchDefaultPaymentAccount()
      .then(setDefaultPaymentAccount)
      .catch(() =>
        message.error("Không tải được tài khoản nhận tiền mặc định."),
      );
  }, [isDepositModalOpen]);
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
  const legacyCnyTotal = resolveLegacyCnyTotal(record);
  const lockedExchangeRate = Number(
    depositVoucher?.exchange_rate ?? record?.exchange_rate ?? 0,
  );
  const productTotalCny = hasDepositVoucher
    ? Number(
        depositVoucher?.base_amount_cny ??
          record?.product_total_cny ??
          legacyCnyTotal,
      )
    : Number(
        record?.product_total_cny ??
          (items.length > 0 ? itemsSubtotal : legacyCnyTotal),
      );
  const productTotalVnd = hasDepositVoucher
    ? Number(depositVoucher?.base_amount_vnd ?? record?.product_total_vnd ?? 0)
    : Number(record?.product_total_vnd ?? 0);
  const estimateTotal = isExchangeRateLocked
    ? productTotalVnd
    : items.length > 0
      ? itemsSubtotal
      : legacyCnyTotal;
  // A snapshot alone is not a payable request. Legacy/interrupted records must
  // create or recover their actual deposit voucher first.
  const hasDepositRequest = hasDepositVoucher;
  const lockedDepositPercent = Number(
    depositVoucher?.deposit_percent ??
      record?.deposit_percent ??
      depositPercentage,
  );
  const depositAmount = hasDepositVoucher
    ? Number(depositVoucher?.total_amount ?? 0)
    : hasDepositRequest
      ? Number(record?.deposit_amount_vnd ?? 0)
      : 0;
  const depositPaidAmount = hasDepositVoucher
    ? Number(depositVoucher?.paid_amount ?? 0)
    : hasDepositRequest
      ? Number(record?.deposit_paid_amount_vnd ?? 0)
      : 0;
  const depositRemainingAmount = hasDepositVoucher
    ? Number(depositVoucher?.remaining_amount ?? depositAmount)
    : hasDepositRequest
      ? Number(record?.deposit_remaining_amount_vnd ?? depositAmount)
      : 0;
  const estimateTotalDisplay = isExchangeRateLocked
    ? formatVnd(estimateTotal)
    : formatCny(estimateTotal);
  const depositDisplay = hasDepositRequest
    ? formatVnd(depositAmount)
    : "Chưa có yêu cầu đặt cọc";
  const depositPaidDisplay = hasDepositRequest
    ? formatVnd(depositPaidAmount)
    : "-";
  const depositRemainingDisplay = hasDepositRequest
    ? formatVnd(depositRemainingAmount)
    : "-";
  const depositTransferContent =
    depositVoucher?.transfer_content ??
    record?.deposit_transfer_content ??
    `COC ${record?.order_code ?? ""}`;
  const depositBankName =
    depositVoucher?.bank_name_snapshot ??
    defaultPaymentAccount?.bank_name ??
    "-";
  const depositBankAccountNumber =
    depositVoucher?.bank_account_number_snapshot ??
    defaultPaymentAccount?.account_number ??
    "-";
  const depositBankAccountHolder =
    depositVoucher?.bank_account_holder_snapshot ??
    defaultPaymentAccount?.account_holder ??
    "-";
  const depositStatus = depositVoucher?.status ?? record?.deposit_status ?? "-";
  const depositStatusLabelMap: Record<string, string> = {
    waiting_payment: "Chờ thanh toán",
    paid: "Đã thanh toán",
    cancelled: "Đã hủy",
  };
  const depositStatusDisplay =
    depositStatusLabelMap[depositStatus] ?? depositStatus;
  const depositTransactions = depositVoucher?.transactions ?? [];
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
  const primaryActionLabel = canOpenConfirmModal
    ? "Xác nhận đơn hàng"
    : canOpenDepositModal
      ? "Xác nhận tiền cọc"
      : canStartPurchasing
        ? "Bắt đầu đặt hàng"
        : canConfirmPurchased
          ? "Xác nhận đã đặt hàng"
          : canManageTrackings
            ? "Quản lý mã vận đơn"
            : "Đơn hàng đã xử lý";

  const handleUpdateOrderStatus = (
    nextStatus: string,
    onSuccessCallback?: () => void,
    extraValues: Record<string, unknown> = {},
  ) => {
    if (!record?.id) return;

    setIsUpdatingStatus(true);

    updateOrder(
      {
        resource: "orders",
        id: record.id,
        values: { status: nextStatus, ...extraValues },
      },
      {
        onSuccess: async () => {
          await query.refetch();
          setIsUpdatingStatus(false);
          onSuccessCallback?.();
        },
        onError: (error) => {
          messageApi.error(
            error instanceof Error
              ? error.message
              : "Cập nhật trạng thái đơn hàng thất bại.",
          );
          setIsUpdatingStatus(false);
        },
      },
    );
  };
  const handleConfirmOrder = async () => {
    if (depositOpions === "deposit") {
      if (!record?.id) return;
      setIsUpdatingStatus(true);

      try {
        syncGraphqlAuthToken();

        // 1. Đổi trạng thái đơn hàng sang awaiting_deposit
        await handleUpdateOrderStatus(
          "awaiting_deposit",
          undefined, // Không dùng callback nữa, dùng await bên dưới
          { deposit_percent: depositPercentage },
        );

        // 2. Chờ tạo phiếu cọc xong hẳn
        await client.request(
          `mutation CreateDepositPaymentVoucher($order_id: ID!, $deposit_percent: Float) {
          createDepositPaymentVoucher(order_id: $order_id, deposit_percent: $deposit_percent) {
            id
            voucher_code
            voucher_type
            status
            currency
            base_amount_cny
            exchange_rate
            base_amount_vnd
            deposit_percent
            total_amount
            paid_amount
            remaining_amount
            bank_name_snapshot
            bank_account_number_snapshot
            bank_account_holder_snapshot
            transfer_content
          }
        }`,
          { order_id: record.id, deposit_percent: depositPercentage },
        );

        // 3. Refetch dữ liệu mới nhất & chuyển Modal
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
    handleUpdateOrderStatus("purchasing", () => {
      setIsConfirmModalOpen(false);
      messageApi.success("Đơn hàng đã chuyển sang trạng thái đang đặt hàng.");
    });
  };

  const handleCreateMissingDepositRequest = async () => {
    if (!record?.id) return;
    setIsUpdatingStatus(true);
    try {
      syncGraphqlAuthToken();
      await client.request(
        `mutation CreateDepositPaymentVoucher($order_id: ID!, $deposit_percent: Float) {
          createDepositPaymentVoucher(order_id: $order_id, deposit_percent: $deposit_percent) {
            id
            voucher_code
            voucher_type
            status
            currency
            base_amount_cny
            exchange_rate
            base_amount_vnd
            deposit_percent
            total_amount
            paid_amount
            remaining_amount
            bank_name_snapshot
            bank_account_number_snapshot
            bank_account_holder_snapshot
            transfer_content
          }
        }`,
        { order_id: record.id, deposit_percent: depositPercentage },
      );
      await query.refetch();
      messageApi.success(
        "Đã chốt tỷ giá và tạo yêu cầu đặt cọc.",
      );
    } catch (error) {
      messageApi.error(
        error instanceof Error
          ? error.message
          : "Không thể tạo yêu cầu đặt cọc.",
      );
    } finally {
      setIsUpdatingStatus(false);
    }
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
                };

          return {
            id: trackingDraft.id,
            tracking_number: trackingDraft.tracking_number.trim().toUpperCase(),
            carrier: trackingDraft.carrier ?? null,
            dispatched_at: formatGraphqlDateTime(trackingDraft.dispatched_at),
            note: trackingDraft.note?.trim() || null,
            declared_value: 0,
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
    value: string | null | undefined,
  ) => {
    setTrackingDrafts((current) =>
      current.map((tracking, index) =>
        index === trackingIndex ? { ...tracking, [field]: value } : tracking,
      ),
    );
  };

  const openTrackingManager = () => {
    setTrackingDrafts(buildTrackingDrafts(orderTrackings));
    setIsTrackingManagerOpen(true);
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
      handleUpdateOrderStatus("awaiting_tracking", () => {
        messageApi.success(
          "Đơn hàng đã chuyển sang trạng thái chờ mã vận đơn.",
        );
      });
      return;
    }

    if (canManageTrackings) {
      openTrackingManager();
    }
  };
  return (
    <>
      {contextHolder}
      <Show
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
                          • Tạo bởi: {record?.creator?.name || "-"}
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
                        disabled={
                          !canOpenConfirmModal &&
                          !canOpenDepositModal &&
                          !canStartPurchasing &&
                          !canConfirmPurchased &&
                          !canManageTrackings
                        }
                        onClick={handlePrimaryAction}
                      >
                        {primaryActionLabel}
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
                            children: record?.creator?.name
                              ? `Nhân viên tạo: ${record.creator.name}`
                              : "-",
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
                            children: record?.creator?.name || "-",
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
                            Đặt cọc ({depositPercentage}%)
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
      </Show>
      <Modal
        open={isConfirmModalOpen}
        onCancel={() => setIsConfirmModalOpen(false)}
        onOk={handleConfirmOrder}
        confirmLoading={isUpdatingStatus}
        title={`Xác nhận đơn hàng ${record?.order_code}`}
        okText="Xác nhận"
        cancelText="Hủy"
      >
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <Text>Đơn hàng hợp lệ, bạn muốn xử lý tiếp?</Text>

          <Radio.Group
            value={depositOpions}
            onChange={(e) => setDepositOptions(e.target.value)}
            style={{ width: "100%" }}
          >
            <Space orientation="vertical" size={12} style={{ width: "100%" }}>
              <div
                style={{
                  ...optionCardStyle,
                  borderColor:
                    depositOpions === "deposit" ? "#1677ff" : "#e5e7eb",
                }}
              >
                <Radio value="deposit">
                  <Text strong>Cần đặt cọc</Text>
                </Radio>

                <div style={{ marginTop: 8, marginLeft: 24 }}>
                  <Text type="secondary">
                    Đơn hàng sẽ chuyển sang trạng thái "awaiting_deposit"
                  </Text>

                  {depositOpions === "deposit" ? (
                    <Space
                      orientation="vertical"
                      size={12}
                      style={{ width: "100%", marginTop: 12 }}
                    >
                      <Space>
                        <Text>Tỷ lệ đặt cọc</Text>
                        <InputNumber
                          min={0}
                          max={100}
                          value={depositPercentage}
                          onChange={(value) =>
                            setDepositPercentage(Number(value ?? 0))
                          }
                        />
                        <Text>%</Text>
                      </Space>

                      <Text>
                        Số tiền cần đặt cọc:{" "}
                        <Text strong style={{ color: "#dc2626" }}>
                          {depositDisplay}
                        </Text>
                      </Text>
                    </Space>
                  ) : null}
                </div>
              </div>

              <div
                style={{
                  ...optionCardStyle,
                  borderColor:
                    depositOpions === "no_deposit" ? "#1677ff" : "#e5e7eb",
                }}
              >
                <Radio value="no_deposit">
                  <Text strong>Không cần đặt cọc</Text>
                </Radio>

                <div style={{ marginTop: 8, marginLeft: 24 }}>
                  <Text type="secondary">
                    Đơn hàng sẽ chuyển sang trạng thái "purchasing"
                  </Text>
                </div>
              </div>
            </Space>
          </Radio.Group>
        </Space>
      </Modal>
      <Modal
        open={isDepositModalOpen}
        onCancel={() => setIsDepositModalOpen(false)}
        footer={null}
        title={`Đơn hàng: ${record?.order_code ?? ""}`}
      >
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <Tag
            color={normalizedOrderStatus === "deposited" ? "green" : "purple"}
          >
            {normalizedOrderStatus === "deposited"
              ? "Đã đặt cọc"
              : "Chờ đặt cọc"}
          </Tag>

          <div style={summaryBlockStyle}>
            <div style={modalSummaryRowStyle}>
              <Text>Tổng tiền tạm tính</Text>
              <Text strong>{estimateTotalDisplay}</Text>
            </div>
            {hasDepositRequest ? (
              <>
                <div style={modalSummaryRowStyle}>
                  <Text>{"Tổng tiền hàng gốc"}</Text>
                  <Text strong>{formatCny(productTotalCny)}</Text>
                </div>
                <div style={modalSummaryRowStyle}>
                  <Text>{"Tỷ giá đã chốt"}</Text>
                  <Text strong>
                    {lockedExchangeRate > 0
                      ? `1 CNY = ${formatVnd(lockedExchangeRate)}`
                      : "-"}
                  </Text>
                </div>
                <div style={modalSummaryRowStyle}>
                  <Text>{"Tổng quy đổi"}</Text>
                  <Text strong>{formatVnd(productTotalVnd)}</Text>
                </div>
              </>
            ) : null}
            <div style={modalSummaryRowStyle}>
              <Text>Tỷ lệ đặt cọc</Text>
              <Text strong>{lockedDepositPercent}%</Text>
            </div>
            <div style={modalSummaryRowStyle}>
              <Text>Số tiền cần đặt cọc</Text>
              <Text strong>{depositDisplay}</Text>
            </div>
            <div style={modalSummaryRowStyle}>
              <Text>Đã thanh toán</Text>
              <Text strong>{depositPaidDisplay}</Text>
            </div>
            <div style={modalSummaryRowStyle}>
              <Text>Còn phải thanh toán</Text>
              <Text strong style={{ color: "#dc2626" }}>
                {depositRemainingDisplay}
              </Text>
            </div>
          </div>

          {!hasDepositRequest ? (
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Alert
                type="warning"
                showIcon
                message="Chưa thể hướng dẫn thanh toán vì chưa có yêu cầu đặt cọc VND hợp lệ."
              />
              <Button
                type="primary"
                loading={isUpdatingStatus}
                onClick={handleCreateMissingDepositRequest}
              >
                {"Tạo yêu cầu đặt cọc"}
              </Button>
            </Space>
          ) : (
            <div style={bankInfoStyle}>
              <Text strong>{"Hướng dẫn thanh toán"}</Text>
              <div>
                <Text>
                  {"Ngân hàng: "}
                  {depositBankName}
                </Text>
              </div>
              <div>
                <Text>STK: {depositBankAccountNumber}</Text>
              </div>
              <div>
                <Text>
                  {"Chủ TK: "}
                  {depositBankAccountHolder}
                </Text>
              </div>
              <div>
                <Text>
                  {"Số tiền chuyển khoản: "}
                  {depositRemainingDisplay}
                </Text>
              </div>
              <div>
                <Text>
                  {"Nội dung: "}
                  {depositTransferContent}
                </Text>
              </div>
              <div>
                <Text>
                  {"Trạng thái phiếu: "}
                  {depositStatusDisplay}
                </Text>
              </div>
            </div>
          )}

          {depositTransactions.length > 0 ? (
            <Table
              size="small"
              pagination={false}
              rowKey="id"
              dataSource={depositTransactions}
              columns={[
                {
                  title: "Mã hệ thống",
                  dataIndex: "transaction_code",
                },
                {
                  title: "Số tiền",
                  dataIndex: "amount",
                  render: (value) => formatVnd(Number(value ?? 0)),
                },
                {
                  title: "Mã ngân hàng",
                  dataIndex: "bank_transaction_code",
                  render: (value) => value || "-",
                },
                {
                  title: "Thời gian nhận",
                  dataIndex: "received_at",
                  render: (value) => formatDateTime(value ?? undefined),
                },
                {
                  title: "Trạng thái",
                  dataIndex: "status",
                  render: (value) =>
                    value === "confirmed"
                      ? "Đã xác nhận"
                      : value,
                },
              ]}
            />
          ) : null}

          {depositVoucher?.invoice ? (
            <Alert
              type="success"
              showIcon
              message="Hóa đơn đặt cọc đã được tạo"
              description={(
                <Space wrap>
                  <Tag color="gold">Hóa đơn đặt cọc</Tag>
                  <Link to={`/invoices/${depositVoucher.invoice.id}`}>
                    {depositVoucher.invoice.invoice_code} — {formatVnd(Number(depositVoucher.invoice.total_amount ?? 0))}
                  </Link>
                </Space>
              )}
            />
          ) : null}

          <Space orientation="vertical" size={8} style={{ width: "100%" }}>
            <InputNumber
              min={0}
              precision={0}
              step={1000}
              style={{ width: "100%" }}
              placeholder="Số tiền đã thanh toán (VND)"
              value={manualDepositAmount}
              onChange={(value) => setManualDepositAmount(Number(value ?? 0))}
              formatter={(value) =>
                value ? `${Number(value).toLocaleString("vi-VN")} VND` : ""
              }
              parser={(value) =>
                Number(value?.replace(/\./g, "").replace(/[^\d]/g, "") || 0)
              }
            />
            <Input
              placeholder="Mã giao dịch / Mã chuyển khoản"
              value={manualDepositCode}
              onChange={(event) => setManualDepositCode(event.target.value)}
              disabled={!hasDepositRequest || depositRemainingAmount <= 0}
            />
            <Input.TextArea
              placeholder="Ghi chú xác nhận thanh toán"
              value={manualDepositNote}
              onChange={(event) => setManualDepositNote(event.target.value)}
              disabled={!hasDepositRequest || depositRemainingAmount <= 0}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </Space>

          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Button
              type="primary"
              loading={isUpdatingStatus}
              disabled={
                !hasDepositRequest ||
                depositRemainingAmount <= 0 ||
                normalizedOrderStatus === "deposited" ||
                manualDepositAmount !== depositRemainingAmount ||
                !manualDepositCode.trim()
              }
              onClick={handleConfirmDepositPaid}
            >
              Xác nhận đã thanh toán
            </Button>
            <Button>Gửi nhắc nhở</Button>
          </Space>
        </Space>
      </Modal>
      <Modal
        open={isTrackingManagerOpen}
        onCancel={() => setIsTrackingManagerOpen(false)}
        width={1240}
        destroyOnHidden={false}
        title={`Quản lý mã vận đơn - Đơn hàng ${record?.order_code ?? ""}`}
        footer={
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <div>
              {isTrackingEditable &&
              normalizedOrderStatus === "awaiting_tracking" ? (
                <Button
                  type="primary"
                  ghost
                  disabled={declaredTrackingCount === 0}
                  loading={isUpdatingStatus}
                  onClick={handleMoveToWaitingCnWarehouse}
                >
                  Chuyển sang chờ kho TQ nhận hàng
                </Button>
              ) : null}
            </div>
            <Space>
              <Button onClick={() => setIsTrackingManagerOpen(false)}>
                Hủy
              </Button>
              <Button
                type="primary"
                loading={isUpdatingStatus}
                disabled={!isTrackingEditable}
                onClick={handleSaveAllTrackings}
              >
                Lưu tất cả
              </Button>
            </Space>
          </Space>
        }
      >
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <Card size="small">
            <Row gutter={[16, 16]} align="middle">
              <Col xs={24} md={7}>
                <Space orientation="vertical" size={2}>
                  <Text type="secondary">Mã đơn hàng</Text>
                  <Text strong>{record?.order_code ?? "-"}</Text>
                  <Text type="secondary">
                    Khách hàng: {record?.customer?.name ?? "-"}
                  </Text>
                  <Text type="secondary">
                    Ngày đặt: {formatDateOnly(record?.created_at)}
                  </Text>
                </Space>
              </Col>
              <Col xs={12} md={3}>
                <Space
                  orientation="vertical"
                  size={0}
                  style={{ width: "100%", textAlign: "center" }}
                >
                  <Text type="secondary">Tổng SKU</Text>
                  <Title level={2} style={{ margin: 0 }}>
                    {items.length}
                  </Title>
                </Space>
              </Col>
              <Col xs={12} md={4}>
                <Space
                  orientation="vertical"
                  size={0}
                  style={{ width: "100%", textAlign: "center" }}
                >
                  <Text type="secondary">Da khai bao tracking</Text>
                  <Title level={2} style={{ margin: 0, color: "#16a34a" }}>
                    {declaredTrackingCount}
                  </Title>
                </Space>
              </Col>
              <Col xs={12} md={4}>
                <Space
                  orientation="vertical"
                  size={0}
                  style={{ width: "100%", textAlign: "center" }}
                >
                  <Text type="secondary">Cho kho TQ xac nhan item</Text>
                  <Title level={2} style={{ margin: 0, color: "#f97316" }}>
                    {remainingSkuCount}
                  </Title>
                </Space>
              </Col>
              <Col xs={24} md={6}>
                <Alert
                  type="info"
                  showIcon
                  title="Luu y"
                  description="Buoc nay chi khai bao ma van don thuoc don hang. Item ben trong se duoc kho Trung Quoc xac nhan sau."
                />
              </Col>
            </Row>
          </Card>

          <Row gutter={[16, 16]} align="top">
            <Col xs={24} xl={10}>
              <Card title="1. San pham trong don" size="small">
                {items.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Đơn hàng chưa có sản phẩm."
                  />
                ) : (
                  <Space
                    orientation="vertical"
                    size={12}
                    style={{ width: "100%" }}
                  >
                    <Alert
                      type="info"
                      showIcon
                      message="Danh sach san pham cua don duoc giu de kho TQ doi chieu sau khi nhan hang."
                    />
                    <Table
                      size="small"
                      pagination={false}
                      rowKey="key"
                      scroll={{ x: 720 }}
                      dataSource={items.map((item, index) => ({
                        key: item.id,
                        index: index + 1,
                        productName: item.product_name,
                        shop: item.shop_name ?? item.seller ?? "-",
                        variant: getVariantLabel(item),
                        quantity: item.quantity,
                      }))}
                      columns={[
                        {
                          title: "#",
                          dataIndex: "index",
                          width: 48,
                          align: "center" as const,
                        },
                        {
                          title: "San pham",
                          dataIndex: "productName",
                          key: "productName",
                        },
                        {
                          title: "Shop",
                          dataIndex: "shop",
                          key: "shop",
                          width: 160,
                        },
                        {
                          title: "Phan loai",
                          dataIndex: "variant",
                          key: "variant",
                          width: 140,
                        },
                        {
                          title: "SL dat",
                          dataIndex: "quantity",
                          key: "quantity",
                          width: 80,
                          align: "center" as const,
                        },
                      ]}
                    />
                  </Space>
                )}
              </Card>
            </Col>

            <Col xs={24} xl={14}>
              <Card
                title="2. Danh sách mã vận đơn"
                size="small"
                extra={
                  <Button
                    type="dashed"
                    onClick={addTrackingDraft}
                    disabled={!isTrackingEditable}
                  >
                    + Thêm mã vận đơn khác
                  </Button>
                }
              >
                {trackingDrafts.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Chưa có mã vận đơn nào. Hãy thêm block mã vận đơn đầu tiên."
                  />
                ) : (
                  <Space
                    orientation="vertical"
                    size={16}
                    style={{ width: "100%" }}
                  >
                    {trackingDrafts.map((tracking, trackingIndex) => (
                      <Card
                        key={tracking.local_id}
                        size="small"
                        title={`Mã vận đơn #${trackingIndex + 1}`}
                        extra={
                          <Button
                            danger
                            type="text"
                            disabled={!isTrackingEditable}
                            onClick={() => removeTrackingDraft(trackingIndex)}
                          >
                            Xóa mã này
                          </Button>
                        }
                      >
                        <Space
                          orientation="vertical"
                          size={16}
                          style={{ width: "100%" }}
                        >
                          <Row gutter={[12, 12]}>
                            <Col xs={24} md={10}>
                              <Text>Mã vận đơn *</Text>
                              <Input
                                value={tracking.tracking_number}
                                disabled={!isTrackingEditable}
                                onChange={(event) =>
                                  updateTrackingDraft(
                                    trackingIndex,
                                    "tracking_number",
                                    event.target.value.toUpperCase(),
                                  )
                                }
                                placeholder="VD: YD123456789CN"
                              />
                            </Col>
                            <Col xs={24} md={7}>
                              <Text>Đơn vị vận chuyển *</Text>
                              <Select
                                value={tracking.carrier ?? undefined}
                                disabled={!isTrackingEditable}
                                options={carrierOptions}
                                onChange={(value) =>
                                  updateTrackingDraft(
                                    trackingIndex,
                                    "carrier",
                                    value,
                                  )
                                }
                                placeholder="Chọn đơn vị"
                              />
                            </Col>
                            <Col xs={24} md={7}>
                              <Text>Shop / người bán</Text>
                              <Input
                                value={getTrackingShopSummary()}
                                disabled
                              />
                            </Col>
                            <Col xs={24} md={7}>
                              <Text>Ngày phát hàng</Text>
                              <DatePicker
                                style={{ width: "100%" }}
                                value={
                                  tracking.dispatched_at
                                    ? dayjs(tracking.dispatched_at)
                                    : null
                                }
                                disabled={!isTrackingEditable}
                                format="DD/MM/YYYY"
                                onChange={(value) =>
                                  updateTrackingDraft(
                                    trackingIndex,
                                    "dispatched_at",
                                    value
                                      ? value
                                          .startOf("day")
                                          .format("YYYY-MM-DD HH:mm:ss")
                                      : null,
                                  )
                                }
                              />
                            </Col>
                            <Col xs={24} md={17}>
                              <Text>Ghi chú</Text>
                              <Input.TextArea
                                rows={2}
                                value={tracking.note ?? ""}
                                disabled={!isTrackingEditable}
                                onChange={(event) =>
                                  updateTrackingDraft(
                                    trackingIndex,
                                    "note",
                                    event.target.value,
                                  )
                                }
                                placeholder="Ví dụ: Shop đóng gói cẩn thận"
                              />
                            </Col>
                          </Row>

                          <Space
                            orientation="vertical"
                            size={10}
                            style={{ width: "100%" }}
                          >
                            <Alert
                              type="info"
                              showIcon
                              message="Item trong tracking này chưa được xác định ở bước khai báo. Kho Trung Quốc sẽ xác nhận sau khi nhận hàng thực tế."
                            />
                          </Space>
                        </Space>
                      </Card>
                    ))}
                  </Space>
                )}
              </Card>
            </Col>
          </Row>

          {isTrackingEditable ? (
            <Alert
              type="info"
              showIcon
              title="Buoc xac nhan item duoc thuc hien tai kho TQ"
              description="Tai day chi luu danh sach tracking cua don. Sau khi hang ve kho Trung Quoc, nhan vien se doi chieu va xac nhan item trong tung tracking."
            />
          ) : null}

          {isTrackingReadonly ? (
            <Alert
              type="info"
              showIcon
              title="Đơn hàng đang ở chế độ chỉ xem"
              description="Đơn hàng đã ở trạng thái không còn cho phép chỉnh sửa mã vận đơn."
            />
          ) : null}
        </Space>
      </Modal>
    </>
  );
};
