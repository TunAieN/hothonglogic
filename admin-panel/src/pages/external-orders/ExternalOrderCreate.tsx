import { useEffect, useMemo, useRef, useState } from "react";
import { useGetIdentity, useList } from "@refinedev/core";
import { Dayjs } from "dayjs";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Image,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";
import { Link, useLocation, useNavigate } from "react-router";
import type { Customer as ICustomer, Order as IOrder, OrderCreateInput } from "../../shared/types";
import { dataProvider } from "../../providers/dataProvider";
import {
  getGraphqlAuthToken,
  setGraphqlAuthToken,
} from "../../providers/graphqlClient";
import {
  addExternalOrderDraft,
  clearExternalOrderDrafts,
  loadExternalOrderDrafts,
  parseExternalOrderDraft,
  removeExternalOrderDraft,
  updateExternalOrderDraft,
  type ExternalOrderDraft,
  type ExternalOrderDraftItem,
} from "./externalOrderDraft";
import { DatePicker } from "antd";
const { Title, Text } = Typography;

type EditableDraftItem = ExternalOrderDraftItem & {
  rowId: string;
};

type DraftOrderPreview = {
  id: string;
  order_code: string;
  created_at: string;
  total_amount: number;
  status: "draft";
  creator: {
    name: string;
  };
  customer: {
    address: string;
  };
  note: string;
};

type CurrentUser = {
  id: string;
  name: string;
  email?: string;
  role?: string;
};

const statusTabs = [
  { key: "all", label: "Tất cả đơn hàng" },
  { key: "deposit", label: "Đơn cần đặt cọc" },
  { key: "pending", label: "Chờ xác nhận" },
  { key: "complaint", label: "Khiếu nại" },
  { key: "receiving", label: "Hàng chờ nhận" },
  { key: "completed", label: "Đơn đã hoàn thành" },
];

const makeRowId = (item: ExternalOrderDraftItem, index: number) =>
  String(item.source_item_id ?? `${Date.now()}-${index}`);

const normalizeDraft = (draft: ExternalOrderDraft | undefined) => {
  if (!draft) {
    return {
      customerId: undefined,
      orderNote: "",
      items: [] as EditableDraftItem[],
    };
  }

  return {
    customerId: draft.customer_id ?? undefined,
    orderNote: draft.order_note ?? "",
    items: (draft.items ?? []).map((item, index) => ({
      ...item,
      product_name: item.product_name ?? "",
      product_link: item.product_link ?? "",
      product_image: item.product_image ?? "",
      variant: item.variant ?? "",
      quantity: Number.isFinite(item.quantity) ? item.quantity : 1,
      price_cny: Number.isFinite(item.price_cny) ? item.price_cny : 0,
      note: item.note ?? "",
      rowId: makeRowId(item, index),
    })),
  };
};

const toExternalOrderDraftItem = (item: EditableDraftItem): ExternalOrderDraftItem => ({
  source_item_id: item.source_item_id,
  product_name: item.product_name,
  product_link: item.product_link,
  product_image: item.product_image,
  variant: item.variant,
  quantity: item.quantity,
  price_cny: item.price_cny,
  note: item.note,
  seller: item.seller,
  size: item.size,
  color: item.color,
});

const composeItemNote = (item: EditableDraftItem) => {
  const detailNote = item.note?.trim();
  return detailNote || "";
};

const formatCny = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatPreviewDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("vi-VN");
};

const getDraftOrderCode = (draft: ExternalOrderDraft) => {
  if (draft.draft_id.trim()) {
    return draft.draft_id;
  }

  const timestamp = new Date(draft.created_at ?? "").getTime();

  if (Number.isNaN(timestamp)) {
    return "Đơn tạm từ extension";
  }

  return `DRAFT-${timestamp}`;
};

export const ExternalOrderCreate = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [messageApi, contextHolder] = message.useMessage();
  const [drafts, setDrafts] = useState<ExternalOrderDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const [filters, setFilters] = useState({
    orderCode: "",
    status: "all",
    fromDate: null as Dayjs | null,
    toDate: null as Dayjs | null,
  });
  const { data: currentUser } = useGetIdentity<CurrentUser>();
  const { result: customerListResponse, query: customersQuery } =
    useList<ICustomer>({
      resource: "customers",
      pagination: {
        currentPage: 1,
        pageSize: 100,
      },
    });

  const customers = useMemo(
    () => customerListResponse?.data ?? [],
    [customerListResponse?.data],
  );
  const isCustomersLoading = customersQuery.isLoading;
  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.draft_id === selectedDraftId),
    [drafts, selectedDraftId],
  );
  const normalizedSelectedDraft = useMemo(
    () => normalizeDraft(selectedDraft),
    [selectedDraft],
  );
  const customerId = normalizedSelectedDraft.customerId;
  const orderNote = normalizedSelectedDraft.orderNote;
  const items = normalizedSelectedDraft.items;
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId),
    [customerId, customers],
  );
  const customerOptions = customers.map((customer) => ({
    label: `${customer.code ?? customer.id} - ${customer.name} (${customer.phone})`,
    value: customer.id,
  }));
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.price_cny,
    0,
  );

  useEffect(() => {
    const token = getGraphqlAuthToken();

    if (token) {
      setGraphqlAuthToken(token);
    }
    const params = new URLSearchParams(location.search);
    const payload = params.get("payload");

    const parsedDraft = parseExternalOrderDraft(payload);

    if (parsedDraft) {
      const nextDraft = addExternalOrderDraft(parsedDraft);
      const nextDrafts = loadExternalOrderDrafts();
      setDrafts(nextDrafts);
      setSelectedDraftId(nextDraft.draft_id);
      window.history.replaceState({}, document.title, location.pathname);
      return;
    }

    const storedDrafts = loadExternalOrderDrafts();
    setDrafts(storedDrafts);
    setSelectedDraftId((currentSelectedDraftId) => {
      if (
        currentSelectedDraftId &&
        storedDrafts.some((draft) => draft.draft_id === currentSelectedDraftId)
      ) {
        return currentSelectedDraftId;
      }

      return storedDrafts[0]?.draft_id;
    });
  }, [location.pathname, location.search]);

  const syncDraftsFromStorage = () => {
    const nextDrafts = loadExternalOrderDrafts();
    setDrafts(nextDrafts);
    return nextDrafts;
  };

  const patchSelectedDraft = (patch: Partial<ExternalOrderDraft>) => {
    if (!selectedDraftId) {
      return;
    }

    updateExternalOrderDraft(selectedDraftId, patch);
    syncDraftsFromStorage();
  };

  const handleCustomerChange = (value: string | undefined) => {
    patchSelectedDraft({ customer_id: value ?? null });
  };

  const handleOrderNoteChange = (value: string) => {
    patchSelectedDraft({ order_note: value });
  };

  const updateItems = (nextItems: EditableDraftItem[]) => {
    patchSelectedDraft({
      items: nextItems.map(toExternalOrderDraftItem),
    });
  };

  const updateItem = (rowId: string, patch: Partial<EditableDraftItem>) => {
    const nextItems = items.map((item) =>
      item.rowId === rowId ? { ...item, ...patch } : item,
    );
    updateItems(nextItems);
  };

  const removeItem = (rowId: string) => {
    const nextItems = items.filter((item) => item.rowId !== rowId);
    updateItems(nextItems);
  };

  const addEmptyItem = () => {
    const nextItems: EditableDraftItem[] = [
      ...items,
      {
        rowId: `${Date.now()}-${items.length}`,
        product_name: "",
        product_link: "",
        product_image: "",
        variant: "",
        quantity: 1,
        price_cny: 0,
        note: "",
      },
    ];

    updateItems(nextItems);
  };

  const handleRemoveDraft = (draftId: string) => {
    const nextDrafts = removeExternalOrderDraft(draftId);
    setDrafts(nextDrafts);
    setSelectedDraftId((currentSelectedDraftId) => {
      if (currentSelectedDraftId && currentSelectedDraftId !== draftId) {
        return currentSelectedDraftId;
      }

      return nextDrafts[0]?.draft_id;
    });
    messageApi.success("Đã xóa đơn tạm.");
  };

  const handleClearSelectedDraft = () => {
    if (!selectedDraftId) {
      messageApi.info("Không có đơn tạm đang được chọn.");
      return;
    }

    handleRemoveDraft(selectedDraftId);
  };

  const handleClearAllDrafts = () => {
    clearExternalOrderDrafts();
    setDrafts([]);
    setSelectedDraftId(undefined);
    messageApi.success("Đã xóa toàn bộ đơn tạm.");
  };

  const validateDraft = (draft: ExternalOrderDraft | undefined) => {
    if (!draft) {
      messageApi.error("Không có đơn tạm để xác nhận.");
      return false;
    }

    const normalizedDraft = normalizeDraft(draft);

    if (!normalizedDraft.customerId) {
      messageApi.error("Phải chọn khách hàng.");
      return false;
    }

    if (normalizedDraft.items.length === 0) {
      messageApi.error("Phải có ít nhất 1 sản phẩm.");
      return false;
    }

    for (const item of normalizedDraft.items) {
      if (item.quantity <= 0) {
        messageApi.error(
          `Số lượng phải lớn hơn 0: ${item.product_name || item.rowId}`,
        );
        return false;
      }

      if (item.price_cny < 0) {
        messageApi.error(
          `Đơn giá phải lớn hơn hoặc bằng 0: ${item.product_name || item.rowId}`,
        );
        return false;
      }

      if (!item.product_link.trim()) {
        messageApi.error(
          `Link sản phẩm không được rỗng: ${item.product_name || item.rowId}`,
        );
        return false;
      }
    }

    return true;
  };

  const handleSubmitDraft = async (draftId?: string) => {
    if (isSubmitting || submitLockRef.current) {
      console.warn("[ExternalOrderCreate] Ignored duplicate create order request.", {
        draftId: draftId ?? selectedDraftId,
      });
      return;
    }

    const targetDraftId = draftId ?? selectedDraftId;
    const targetDraft = drafts.find(
      (draft) => draft.draft_id === targetDraftId,
    );
    const token = getGraphqlAuthToken();

    if (!validateDraft(targetDraft)) {
      return;
    }

    if (!targetDraft) {
      return;
    }

    if (!token) {
      messageApi.error("Bạn cần đăng nhập trước khi tạo đơn hàng");
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }

    setGraphqlAuthToken(token);

    const normalizedDraft = normalizeDraft(targetDraft);
    const payload: OrderCreateInput = {
      customer_id: normalizedDraft.customerId!,
      note: normalizedDraft.orderNote.trim() || undefined,
      items: normalizedDraft.items.map((item) => ({
        product_name: item.product_name.trim(),
        product_link: item.product_link.trim(),
        product_image: item.product_image?.trim() || undefined,
        price_cny: item.price_cny,
        quantity: item.quantity,
        note: composeItemNote(item) || undefined,
        seller: item.seller?.trim() || undefined,
        size: item.size?.trim() || undefined,
        color: item.color?.trim() || undefined,
      })),
    };

    try {
      submitLockRef.current = true;
      setIsSubmitting(true);
      console.log("[ExternalOrderCreate] Sending create order request.", {
        draftId: targetDraft.draft_id,
        itemCount: payload.items.length,
      });
      const result = await dataProvider.create<IOrder>({
        resource: "orders",
        variables: payload,
      });
      console.log("[ExternalOrderCreate] Create order request completed.", {
        draftId: targetDraft.draft_id,
        orderId: result.data.id,
      });

      const nextDrafts = removeExternalOrderDraft(targetDraft.draft_id);
      setDrafts(nextDrafts);
      setSelectedDraftId(nextDrafts[0]?.draft_id);
      messageApi.success("Tạo đơn hàng thành công.");
      navigate(`/orders/show/${result.data.id}`);
    } catch (error) {
      console.error(error);
      messageApi.error(
        error instanceof Error
          ? error.message
          : "Không thể tạo đơn hàng ngoài frontend.",
      );
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const columns: ColumnsType<EditableDraftItem> = [
    {
      title: "Ảnh",
      dataIndex: "product_image",
      key: "product_image",
      width: 110,
      render: (value: string) =>
        value ? (
          <Image
            src={value}
            alt="product"
            width={72}
            height={72}
            style={{ objectFit: "cover", borderRadius: 12 }}
          />
        ) : (
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              background: "#f3f4f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShoppingCartOutlined style={{ color: "#94a3b8", fontSize: 22 }} />
          </div>
        ),
    },
    {
      title: "Sản phẩm",
      key: "product",
      width: 320,
      render: (_, record) => (
        <Space direction="vertical" size={6} style={{ width: "100%" }}>
          <Input
            value={record.product_name}
            onChange={(event) =>
              updateItem(record.rowId, { product_name: event.target.value })
            }
            placeholder="Tên sản phẩm"
          />
          <Input
            value={record.product_link}
            onChange={(event) =>
              updateItem(record.rowId, { product_link: event.target.value })
            }
            placeholder="Link sản phẩm"
          />
          {record.variant ? <Tag color="gold">{record.variant}</Tag> : null}
        </Space>
      ),
    },
    {
      title: "Số lượng",
      dataIndex: "quantity",
      key: "quantity",
      width: 120,
      render: (value: number, record) => (
        <InputNumber
          min={1}
          value={value}
          onChange={(nextValue) =>
            updateItem(record.rowId, { quantity: Number(nextValue ?? 1) })
          }
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "Đơn giá ¥",
      dataIndex: "price_cny",
      key: "price_cny",
      width: 140,
      render: (value: number, record) => (
        <InputNumber
          min={0}
          value={value}
          onChange={(nextValue) =>
            updateItem(record.rowId, { price_cny: Number(nextValue ?? 0) })
          }
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "Tạm tính ¥",
      key: "line_total",
      width: 140,
      render: (_, record) => (
        <Text strong>{formatCny(record.quantity * record.price_cny)}</Text>
      ),
    },
    {
      title: "Ghi chú",
      dataIndex: "note",
      key: "note",
      render: (value: string | undefined, record) => (
        <Input.TextArea
          value={value}
          onChange={(event) =>
            updateItem(record.rowId, { note: event.target.value })
          }
          autoSize={{ minRows: 2, maxRows: 4 }}
          placeholder="Ghi chú từng sản phẩm"
        />
      ),
    },
    {
      title: "",
      key: "actions",
      width: 72,
      render: (_, record) => (
        <Button
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeItem(record.rowId)}
        />
      ),
    },
  ];

  const currentUserName =
    currentUser?.name || currentUser?.email || "Tài khoản đang đăng nhập";

  const draftOrderData: DraftOrderPreview[] = drafts.map((draft) => {
    const customer = customers.find(
      (item) => item.id === (draft.customer_id ?? undefined),
    );
    const totalAmount = (draft.items ?? []).reduce(
      (sum, item) =>
        sum + (Number(item.quantity) || 0) * (Number(item.price_cny) || 0),
      0,
    );

    return {
      id: draft.draft_id,
      order_code: getDraftOrderCode(draft),
      created_at: draft.created_at ?? new Date().toISOString(),
      total_amount: totalAmount,
      status: "draft",
      creator: {
        name: currentUserName,
      },
      customer: {
        address: customer?.address || "",
      },
      note: draft.order_note?.trim() || "Chưa có ghi chú",
    };
  });
  const filteredDraftOrderData = draftOrderData.filter((item) => {
    // Filter mã đơn
    const matchOrderCode =
      !filters.orderCode ||
      item.order_code.toLowerCase().includes(filters.orderCode.toLowerCase());

    // Filter trạng thái
    const matchStatus =filters.status === "all" ||item.status === filters.status;

    // Filter ngày
    const createdDate = new Date(item.created_at);

    const matchFromDate =
      !filters.fromDate || createdDate >= filters.fromDate.toDate();

    const matchToDate =
      !filters.toDate || createdDate <= filters.toDate.toDate();

    return matchOrderCode && matchStatus && matchFromDate && matchToDate;
  });
  const draftOrderColumns: ColumnsType<DraftOrderPreview> = [
    {
      title: "Chọn",
      key: "select",
      width: 80,
      render: (_, record) => (
        <Radio
          checked={record.id === selectedDraftId}
          onChange={() => setSelectedDraftId(record.id)}
        />
      ),
    },
    { title: "Mã ĐH", dataIndex: "order_code", key: "order_code" },
    {
      title: "Ngày tạo",
      dataIndex: "created_at",
      key: "created_at",
      render: (value: string) => formatPreviewDate(value),
    },
    {
      title: "Tổng tiền tạm tính (¥)",
      dataIndex: "total_amount",
      key: "total_amount",
      render: (value: number) => formatCny(value),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
     render: (status) => {

    if (status === "draft") {
        return <Tag color="gold">Đơn tạm</Tag>;
    }

    if (status === "pending") {
        return <Tag color="blue">Chờ xác nhận</Tag>;
    }

    if (status === "completed") {
        return <Tag color="green">Hoàn thành</Tag>;
    }

    return <Tag>{status}</Tag>;
  },
    },
    { title: "Nhân viên CSKH", dataIndex: ["creator", "name"], key: "creator" },
    {
      title: "Địa chỉ nhận hàng",
      dataIndex: ["customer", "address"],
      key: "address",
    },
    { title: "Lý trình đơn hàng", dataIndex: "note", key: "note" },
  ];

  return (
    <>
      {contextHolder}
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Card
          bordered={false}
          style={{
            borderRadius: 24,
            background:
              "linear-gradient(135deg, #fff7ed 0%, #ffffff 56%, #eff6ff 100%)",
            boxShadow: "0 22px 60px rgba(15, 23, 42, 0.08)",
          }}
        >
          <Space
            direction="vertical"
            size={16}
            style={{ width: "100%", display: "flex" }}
          >
            <Space
              style={{
                width: "100%",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <Space size={14}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 16,
                    background: "#ef4444",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 18,
                  }}
                >
                  L
                </div>
                <div>
                  <Text
                    style={{
                      color: "#ef4444",
                      fontWeight: 700,
                      letterSpacing: 1.2,
                    }}
                  >
                    LOGISTICS SYSTEM
                  </Text>
                  <Title
                    level={2}
                    style={{ margin: "4px 0 0", color: "#111827" }}
                  >
                    ĐƠN ĐẶT HÀNG
                  </Title>
                </div>
              </Space>
              <Space wrap>
                <Link to="/orders">
                  <Button>Danh sách đơn hàng</Button>
                </Link>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => navigate("/orders")}
                >
                  Quay lại giỏ hàng
                </Button>
                <Popconfirm
                  title="Xóa đơn tạm đang chọn?"
                  okText="Xóa"
                  cancelText="Hủy"
                  onConfirm={handleClearSelectedDraft}
                  disabled={!selectedDraftId}
                >
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    disabled={!selectedDraftId}
                  >
                    Xóa dữ liệu tạm
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title="Xóa tất cả đơn tạm?"
                  okText="Xóa tất cả"
                  cancelText="Hủy"
                  onConfirm={handleClearAllDrafts}
                  disabled={drafts.length === 0}
                >
                  <Button danger ghost disabled={drafts.length === 0}>
                    Xóa tất cả đơn tạm
                  </Button>
                </Popconfirm>
              </Space>
            </Space>

            <Tabs
              activeKey="all"
              items={statusTabs.map((item) => ({
                ...item,
                children: null,
              }))}
            />

            <Card
              size="small"
              title="Bộ lọc đơn hàng"
              style={{ borderRadius: 18, borderColor: "#e5e7eb" }}
            >
              <Form layout="vertical">
                <Row gutter={[12, 12]}>
                  <Col xs={24} md={6}>
                    <Form.Item label="Mã đơn hàng" style={{ marginBottom: 0 }}>
                      <Input
                        placeholder="Nhập mã đơn hàng"
                        value={filters.orderCode}
                        onChange={(e) =>
                          setFilters({
                            ...filters,
                            orderCode: e.target.value,
                          })
                        }
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item label="Từ ngày" style={{ marginBottom: 0 }}>
                      <DatePicker
                        style={{ width: "100%" }}
                        format="DD/MM/YYYY"
                        onChange={(date) =>
                          setFilters({
                            ...filters,
                            fromDate: date,
                          })
                        }
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item label="Đến ngày" style={{ marginBottom: 0 }}>
                      <DatePicker
                        style={{ width: "100%" }}
                        format="DD/MM/YYYY"
                        onChange={(date) =>
                          setFilters({
                            ...filters,
                            toDate: date,
                          })
                        }
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={6}>
                    <Form.Item label="Trạng thái" style={{ marginBottom: 0 }}>
                      <Select
                        placeholder="Tất cả trạng thái"
                        value={filters.status}
                        onChange={(value) =>
                          setFilters({
                            ...filters,
                            status: value,
                          })
                        }
                        options={statusTabs.map((item) => ({
                          label: item.label,
                          value: item.key,
                        }))}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Space style={{ marginTop: 16 }}>
                  <Button type="primary">Tìm kiếm</Button>
                  <Button
                    onClick={() => {
                      setFilters({
                        orderCode: "",
                        status: "",
                        fromDate: null,
                        toDate: null,
                      });
                    }}
                  >
                    Reset
                  </Button>
                </Space>
              </Form>
            </Card>

            <Card
              size="small"
              title="Danh sách đơn hàng tạm"
              extra={
                <Space wrap>
                  <Button
                    style={{
                      background: "#16a34a",
                      color: "#fff",
                      borderColor: "#16a34a",
                    }}
                  >
                    Tải công cụ đặt
                  </Button>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() =>
                      window.scrollTo({
                        top: document.body.scrollHeight,
                        behavior: "smooth",
                      })
                    }
                  >
                    Tạo đơn hàng
                  </Button>
                  <Button
                    danger
                    onClick={() => handleRemoveDraft(selectedDraftId ?? "")}
                    disabled={!selectedDraftId}
                  >
                    Hủy đơn hàng
                  </Button>
                </Space>
              }
            >
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="Đây là đơn hàng tạm từ extension. Đơn chỉ được lưu sau khi bấm Xác nhận tạo đơn hàng."
              />
              <Table<DraftOrderPreview>
                rowKey="id"
                pagination={{
                  pageSize: 10,
                  showSizeChanger: true,
                  pageSizeOptions: ["10", "20", "50", "100"],
                  showTotal: (total, range) =>
                    `${range[0]}-${range[1]} / ${total} bản ghi`,
                }}
                locale={{
                  emptyText:
                    "Đơn hàng mới tạo sẽ xuất hiện tại đây sau khi extension gửi payload.",
                }}
                columns={draftOrderColumns}
                dataSource={filteredDraftOrderData}
                rowClassName={(record) =>
                  record.id === selectedDraftId ? "ant-table-row-selected" : ""
                }
                style={{ marginBottom: 12 }}
              />
            </Card>
          </Space>
        </Card>

        <Row gutter={[20, 20]}>
          <Col xs={24} xl={8}>
            <Card
              title="Thông tin khách hàng"
              style={{
                borderRadius: 20,
                boxShadow: "0 18px 48px rgba(15, 23, 42, 0.06)",
              }}
            >
              <Space
                direction="vertical"
                size="middle"
                style={{ width: "100%" }}
              >
                <div>
                  <Text strong>Khách hàng</Text>
                  <Select
                    showSearch
                    allowClear
                    value={customerId}
                    onChange={handleCustomerChange}
                    options={customerOptions}
                    loading={isCustomersLoading}
                    placeholder="Chọn khách hàng"
                    style={{ width: "100%", marginTop: 8 }}
                    optionFilterProp="label"
                    disabled={!selectedDraft}
                  />
                </div>

                <div>
                  <Text strong>Địa chỉ nhận hàng</Text>
                  <Input.TextArea
                    value={selectedCustomer?.address || ""}
                    readOnly
                    autoSize={{ minRows: 3, maxRows: 5 }}
                    placeholder="Địa chỉ sẽ lấy theo hồ sơ khách hàng đã chọn"
                    style={{ marginTop: 8 }}
                  />
                </div>

                <div>
                  <Text strong>Ghi chú đơn hàng</Text>
                  <Input.TextArea
                    value={orderNote}
                    onChange={(event) =>
                      handleOrderNoteChange(event.target.value)
                    }
                    autoSize={{ minRows: 4, maxRows: 6 }}
                    placeholder="Nhập ghi chú chung cho đơn hàng"
                    style={{ marginTop: 8 }}
                    disabled={!selectedDraft}
                  />
                </div>

                <Alert
                  type="info"
                  showIcon
                  message="Dữ liệu giỏ hàng chỉ là tạm thời."
                  description="Chỉ khi bấm “Xác nhận tạo đơn hàng” thì frontend mới gọi GraphQL mutation createOrder."
                />
              </Space>
            </Card>
          </Col>

          <Col xs={24} xl={16}>
            <Card
              title="Danh sách sản phẩm"
              extra={
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={addEmptyItem}
                  disabled={!selectedDraft || isSubmitting}
                >
                  Thêm sản phẩm
                </Button>
              }
              style={{
                borderRadius: 20,
                boxShadow: "0 18px 48px rgba(15, 23, 42, 0.06)",
              }}
            >
              {items.length === 0 ? (
                <Empty
                  description={
                    selectedDraft
                      ? "Đơn tạm đang chọn chưa có sản phẩm."
                      : "Chưa có đơn tạm nào được chọn."
                  }
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              ) : (
                <Table
                  rowKey="rowId"
                  columns={columns}
                  dataSource={items}
                  pagination={false}
                  scroll={{ x: 1100 }}
                />
              )}
            </Card>

            <Card
              style={{
                marginTop: 20,
                borderRadius: 20,
                background: "#fff7ed",
                borderColor: "#fdba74",
              }}
            >
              <Row gutter={[16, 16]} align="middle">
                <Col xs={24} md={12}>
                  <Space direction="vertical" size={4}>
                    <Text type="secondary">Tổng số lượng</Text>
                    <Title level={3} style={{ margin: 0 }}>
                      {totalQuantity}
                    </Title>
                  </Space>
                </Col>
                <Col xs={24} md={12}>
                  <Space
                    direction="vertical"
                    size={4}
                    style={{ width: "100%", textAlign: "right" }}
                  >
                    <Text type="secondary">Tổng tiền tạm tính (¥)</Text>
                    <Title level={2} style={{ margin: 0, color: "#ea580c" }}>
                      {formatCny(subtotal)}
                    </Title>
                  </Space>
                </Col>
              </Row>
              <Space style={{ marginTop: 20 }} wrap>
                <Button
                  type="primary"
                  size="large"
                  loading={isSubmitting}
                  htmlType="button"
                  onClick={() => handleSubmitDraft()}
                  disabled={!selectedDraft || isSubmitting}
                >
                  {isSubmitting ? "Đang tạo..." : "Xác nhận tạo đơn hàng"}
                </Button>
                <Button size="large" onClick={() => navigate("/orders")}>
                  Quay lại giỏ hàng
                </Button>
                <Popconfirm
                  title="Xóa đơn tạm đang chọn?"
                  okText="Xóa"
                  cancelText="Hủy"
                  onConfirm={handleClearSelectedDraft}
                  disabled={!selectedDraftId}
                >
                  <Button size="large" danger disabled={!selectedDraftId}>
                    Xóa dữ liệu tạm
                  </Button>
                </Popconfirm>
              </Space>
            </Card>
          </Col>
        </Row>
      </Space>
    </>
  );
};
