import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Button,
  Empty,
  Grid,
  Input,
  Modal,
  Pagination,
  Popover,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ClockCircleOutlined,
  CloseOutlined,
  CopyOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  SearchOutlined,
  ShopOutlined,
  TruckOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router";
import { CN_EXPECTED_INBOUND_QUERY } from "../../../graphql/cnPackages";
import { client, getGraphqlAuthHeaders, syncGraphqlAuthToken } from "../../../providers/graphqlClient";
import { MEDIA_IMAGE_FALLBACK, resolveMediaUrl } from "../../../shared/utils/mediaUrl";
import "./expected-inbound-modal.css";

const { Text, Title } = Typography;
const PAGE_SIZE = 10;

const EllipsisText = ({ value, strong, secondary }: {
  value: string;
  strong?: boolean;
  secondary?: boolean;
}) => (
  <Tooltip title={value} trigger={["hover", "focus"]}>
    <Text
      className="cn-expected-ellipsis"
      strong={strong}
      type={secondary ? "secondary" : undefined}
      tabIndex={0}
    >
      {value}
    </Text>
  </Tooltip>
);

type ExpectedProduct = {
  id: string;
  name: string;
  image?: string | null;
  sku?: string | null;
  quantity: number;
};

export type ExpectedInboundRow = {
  id: string;
  tracking_number: string;
  display_status: "waiting_receipt" | "data_conflict";
  can_receive: boolean;
  order?: {
    id: string;
    order_code: string;
    customer?: { id: string; code?: string | null; name: string } | null;
  } | null;
  purchase_orders: Array<{ id: string; external_order_code: string; shop_name?: string | null }>;
  products: ExpectedProduct[];
  product_summary: { allocated: boolean; sku_count: number; total_quantity: number };
  warehouse?: { id: string; code: string; name: string } | null;
};

type ExpectedInboundResponse = {
  cnExpectedInboundTrackings: {
    data: ExpectedInboundRow[];
    paginatorInfo: {
      currentPage: number;
      lastPage: number;
      perPage: number;
      total: number;
      firstItem?: number | null;
      lastItem?: number | null;
      hasMorePages: boolean;
    };
    summary: { tracking_count: number; order_count: number; customer_count: number };
    shops: string[];
  };
};

type ExpectedInboundModalProps = {
  open: boolean;
  refreshKey: number;
  onClose: () => void;
  canReceive: boolean;
  onReceive: (row: ExpectedInboundRow) => void;
};

const getErrorMessage = (error: unknown) => {
  const graphqlMessage = (
    error as { response?: { errors?: Array<{ message?: string }> } }
  )?.response?.errors?.[0]?.message;

  if (graphqlMessage?.includes("quyền")) {
    return "Bạn không có đủ quyền xem nghiệp vụ kho và đơn hàng liên quan.";
  }

  return "Không thể tải danh sách hàng dự kiến. Vui lòng thử lại.";
};

const ProductPreview = ({ product }: { product: ExpectedProduct }) => (
  <div className="cn-expected-product-popover">
    <Avatar
      shape="square"
      size={52}
      src={resolveMediaUrl(product.image) || MEDIA_IMAGE_FALLBACK}
    />
    <div>
      <Text strong>{product.name}</Text>
      <div><Text type="secondary">SKU: {product.sku || "Chưa có"}</Text></div>
      <div><Text type="secondary">Số lượng: {product.quantity}</Text></div>
    </div>
  </div>
);

export const ExpectedInboundModal = ({
  open,
  refreshKey,
  onClose,
  canReceive,
  onReceive,
}: ExpectedInboundModalProps) => {
  const navigate = useNavigate();
  const { lg, md } = Grid.useBreakpoint();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [shop, setShop] = useState<string>();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [payload, setPayload] = useState<ExpectedInboundResponse["cnExpectedInboundTrackings"]>();
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    if (!open) return;

    const request = ++latestRequest.current;
    setLoading(true);
    setError(undefined);
    try {
      syncGraphqlAuthToken();
      const response = await client.request<ExpectedInboundResponse>(
        CN_EXPECTED_INBOUND_QUERY,
        {
          filter: {
            search: search || null,
            shop: shop || null,
          },
          first: PAGE_SIZE,
          page,
        },
        getGraphqlAuthHeaders(),
      );
      if (request !== latestRequest.current) return;
      const next = response.cnExpectedInboundTrackings;
      if (page > next.paginatorInfo.lastPage) setPage(next.paginatorInfo.lastPage);
      setPayload(next);
    } catch (requestError) {
      if (request !== latestRequest.current) return;
      setError(getErrorMessage(requestError));
      setPayload(undefined);
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [open, page, search, shop]);

  useEffect(() => {
    void load();
    return () => { latestRequest.current += 1; };
  }, [load, refreshKey]);

  const applySearch = () => {
    setPage(1);
    setSearch(draftSearch.trim());
  };

  const resetFilters = () => {
    setDraftSearch("");
    setSearch("");
    setShop(undefined);
    setPage(1);
  };

  const copyTracking = async (trackingNumber: string) => {
    try {
      await navigator.clipboard.writeText(trackingNumber);
      message.success("Đã sao chép mã vận đơn.");
    } catch {
      message.error("Không thể sao chép mã vận đơn.");
    }
  };

  const columns = useMemo<ColumnsType<ExpectedInboundRow>>(() => [
    {
      title: "Mã vận đơn",
      dataIndex: "tracking_number",
      width: lg ? "14%" : md ? "17%" : "27%",
      render: (trackingNumber: string) => (
        <div className="cn-expected-cell-line cn-expected-tracking">
          <EllipsisText value={trackingNumber} strong />
          <Tooltip title="Sao chép mã vận đơn">
            <Button
              type="text"
              size="small"
              aria-label={`Sao chép ${trackingNumber}`}
              icon={<CopyOutlined />}
              onClick={() => void copyTracking(trackingNumber)}
            />
          </Tooltip>
        </div>
      ),
    },
    {
      title: "Khách hàng / Đơn VietTrung",
      key: "order",
      width: lg ? "17%" : md ? "22%" : "25%",
      render: (_, row) => row.order ? (
        <div className="cn-expected-cell-stack">
          <div className="cn-expected-cell-line">
            <UserOutlined />
            <EllipsisText value={row.order.customer?.name || "Chưa có khách hàng"} strong />
          </div>
          <Tooltip title={row.order.order_code} trigger={["hover", "focus"]}>
            <Button
              type="link"
              className="cn-expected-inline-link"
              onClick={() => {
                onClose();
                navigate(`/orders/show/${row.order?.id}`);
              }}
            >
              <span className="cn-expected-ellipsis">{row.order.order_code}</span>
            </Button>
          </Tooltip>
        </div>
      ) : <Text type="secondary">Không xác định</Text>,
    },
    {
      title: "Đơn Taobao / Shop",
      key: "purchase",
      width: lg ? "18%" : "23%",
      responsive: ["md"],
      render: (_, row) => row.purchase_orders.length ? (
        <div className="cn-expected-cell-stack">
          {row.purchase_orders.slice(0, 2).map((purchase) => (
            <div key={purchase.id}>
              <div className="cn-expected-cell-line">
                <ShopOutlined />
                <EllipsisText value={purchase.external_order_code} strong />
              </div>
              <EllipsisText value={purchase.shop_name || "Chưa có tên shop"} secondary />
            </div>
          ))}
          {row.purchase_orders.length > 2 ? (
            <Popover
              title="Các đơn mua liên quan"
              content={row.purchase_orders.map((purchase) => (
                <div className="cn-expected-purchase-popover-line" key={purchase.id}>
                  {purchase.external_order_code} — {purchase.shop_name || "Chưa có shop"}
                </div>
              ))}
            >
              <Button type="link" className="cn-expected-inline-link">+{row.purchase_orders.length - 2} đơn khác</Button>
            </Popover>
          ) : null}
        </div>
      ) : <Tag>Chưa liên kết</Tag>,
    },
    {
      title: "Sản phẩm dự kiến",
      key: "products",
      width: "17%",
      responsive: ["lg"],
      render: (_, row) => row.product_summary.allocated ? (
        <div>
          <Avatar.Group max={{ count: 3 }}>
            {row.products.map((product) => (
              <Popover key={product.id} content={<ProductPreview product={product} />}>
                <Avatar
                  shape="square"
                  src={resolveMediaUrl(product.image) || MEDIA_IMAGE_FALLBACK}
                />
              </Popover>
            ))}
          </Avatar.Group>
          {row.products[0] && <EllipsisText value={row.products[0].name} strong />}
          <div><Text strong>{row.product_summary.sku_count} SKU</Text></div>
          <Text type="secondary">Tổng SL: {row.product_summary.total_quantity}</Text>
        </div>
      ) : (
        <EllipsisText value="Chưa phân bổ sản phẩm theo vận đơn" secondary />
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "display_status",
      width: lg ? "15%" : md ? "17%" : "21%",
      render: (status: ExpectedInboundRow["display_status"]) => status === "data_conflict" ? (
        <Tag className="cn-expected-status" color="error" icon={<InfoCircleOutlined />}>
          <EllipsisText value="Cần kiểm tra dữ liệu" />
        </Tag>
      ) : (
        <Tag className="cn-expected-status" color="gold" icon={<ClockCircleOutlined />}>
          <EllipsisText value="Chờ kho tiếp nhận" />
        </Tag>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: lg ? "19%" : md ? "21%" : "27%",
      render: (_, row) => (
        <Space className="cn-expected-actions" size={6} wrap>
          <Button
            size="small"
            icon={<EyeOutlined />}
            disabled={!row.order}
            onClick={() => {
              if (!row.order) return;
              onClose();
              navigate(`/orders/show/${row.order.id}`);
            }}
          >
            Xem đơn
          </Button>
          <Tooltip title={!canReceive ? "Bạn không có quyền nhập hàng" : row.can_receive ? "Mở form nhập hàng" : "Dữ liệu đang mâu thuẫn, cần đối chiếu trước khi nhập hàng"}>
            <span>
              <Button
                size="small"
                type="primary"
                ghost
                icon={<InboxOutlined />}
                disabled={!canReceive || !row.can_receive}
                onClick={() => onReceive(row)}
              >
                Nhập hàng
              </Button>
            </span>
          </Tooltip>
        </Space>
      ),
    },
  ], [canReceive, lg, md, navigate, onClose, onReceive]);

  const summary = payload?.summary ?? { tracking_count: 0, order_count: 0, customer_count: 0 };
  const pagination = payload?.paginatorInfo;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      width={1240}
      footer={null}
      title={null}
      closeIcon={null}
      destroyOnHidden={false}
      maskClosable={false}
      rootClassName="cn-expected-modal"
      styles={{ body: { padding: 0 } }}
    >
      <div className="cn-expected-shell">
        <header className="cn-expected-header">
          <div className="cn-expected-header__identity">
            <TruckOutlined />
            <div>
              <Title level={3}>Hàng dự kiến về Kho Trung Quốc</Title>
              <Text>Tra cứu các mã vận đơn đã khai báo nhưng chưa được xác nhận tiếp nhận tại kho.</Text>
            </div>
          </div>
          <Button type="text" aria-label="Đóng" icon={<CloseOutlined />} onClick={onClose} />
        </header>

        <section className="cn-expected-body">
          <div className="cn-expected-stats">
            <div><TruckOutlined /><span>Chờ tiếp nhận</span><strong>{summary.tracking_count}</strong></div>
            <div><InboxOutlined /><span>Đơn liên quan</span><strong>{summary.order_count}</strong></div>
            <div><UserOutlined /><span>Khách hàng</span><strong>{summary.customer_count}</strong></div>
            <div><EnvironmentOutlined /><span>Kho dự kiến</span><strong>Chưa xác định</strong></div>
          </div>

          <div className="cn-expected-filters">
            <Input
              allowClear
              prefix={<SearchOutlined />}
              value={draftSearch}
              placeholder="Mã vận đơn / đơn VietTrung / đơn Taobao / khách hàng"
              onChange={(event) => setDraftSearch(event.target.value)}
              onPressEnter={applySearch}
            />
            <Select
              allowClear
              showSearch
              value={shop}
              placeholder="Tất cả shop"
              optionFilterProp="label"
              options={(payload?.shops ?? []).map((value) => ({ value, label: value }))}
              onChange={(value) => {
                setShop(value);
                setPage(1);
              }}
            />
            <Tooltip title="Schema hiện tại chưa lưu kho dự kiến trên tracking">
              <Select
                disabled
                value="unknown"
                options={[{ value: "unknown", label: "Kho chưa xác định" }]}
              />
            </Tooltip>
            <Button type="primary" icon={<SearchOutlined />} onClick={applySearch}>Tìm kiếm</Button>
            <Button onClick={resetFilters}>Đặt lại</Button>
          </div>

          {error ? (
            <Alert
              showIcon
              type="error"
              message={error}
              action={<Button size="small" onClick={() => void load()}>Thử lại</Button>}
            />
          ) : null}

          <div className="cn-expected-list cn-expected-scroll">
            <Table<ExpectedInboundRow>
              rowKey="id"
              size="middle"
              loading={loading}
              columns={columns}
              dataSource={payload?.data ?? []}
              pagination={false}
              tableLayout="fixed"
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={search || shop
                      ? "Không có mã vận đơn phù hợp bộ lọc."
                      : "Không có tracking nào đang chờ kho tiếp nhận."}
                  />
                ),
              }}
            />
          </div>

          <Alert
            className="cn-expected-note"
            showIcon
            type="info"
            message="Danh sách dựa trên tracking đã khai báo; đây không phải bằng chứng hàng đã tới kho."
          />
        </section>

        <footer className="cn-expected-footer">
          <Text>
            Hiển thị {pagination?.firstItem ?? 0}–{pagination?.lastItem ?? 0} / {pagination?.total ?? 0} mã vận đơn
          </Text>
          <Space>
            <Pagination
              size="small"
              current={page}
              pageSize={PAGE_SIZE}
              total={pagination?.total ?? 0}
              showSizeChanger={false}
              onChange={setPage}
            />
            <Button onClick={onClose}>Đóng</Button>
          </Space>
        </footer>
      </div>
    </Modal>
  );
};
