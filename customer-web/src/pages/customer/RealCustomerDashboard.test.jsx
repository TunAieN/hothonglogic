import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as portalApi from "../../api/customerPortal.js";
import { addItem, saveDraft } from "../../services/customerLocalCart.js";
import RealCustomerDashboard from "./RealCustomerDashboard.jsx";

vi.mock("../../api/customerPortal.js", async () => {
  const actual = await vi.importActual("../../api/customerPortal.js");
  return { ...actual, getCustomerOrders: vi.fn(), getCustomerDashboardAnalytics: vi.fn() };
});

const routes = {
  createOrder: "/tai-khoan/tao-don",
  orderDetail: "/tai-khoan/don-mua-ho/chi-tiet",
  orders: "/tai-khoan/don-mua-ho",
  orderHistory: "/tai-khoan/lich-su-don",
  cart: "/tai-khoan/gio-hang",
};

const account = {
  customer_id: 12,
  name: "Nguyễn Hải Yến",
  customer_code: "KH0012",
  status: "active",
};

const order = (overrides = {}) => ({
  id: 91,
  order_code: "REQ-00091",
  status: "purchasing",
  created_at: "2026-11-19T01:11:00Z",
  updated_at: "2026-11-20T04:15:00Z",
  item_count: 1,
  quantity: 2,
  product_total_cny: "18.10",
  items: [{ id: 1, product_name: "婴儿墨镜配饰链", product_image: null, quantity: 2 }],
  ...overrides,
});

const success = (overrides = {}) => ({
  orders: [order()],
  pagination: { current_page: 1, last_page: 1, per_page: 5, total: 11 },
  statistics: {
    total: 11,
    by_status: { pending: 5, awaiting_deposit: 1, purchasing: 2, receiving: 3 },
  },
  ...overrides,
});

const localItem = (overrides = {}) => ({
  product_url: "https://item.taobao.com/item.htm?id=123",
  platform: "Taobao",
  title: "Áo khoác trẻ em",
  main_image: null,
  quantity: 2,
  reference_price_cny: 12.5,
  ...overrides,
});

const analytics = (overrides = {}) => ({
  period: { months: 6, from: "2026-06-01", to: "2026-11-30", timezone: "UTC" },
  monthly: [
    { month: "2026-06", order_count: 0, reference_value_cny: "0.00", known_item_count: 0, unknown_item_count: 0, reference_value_completeness: "complete", by_status: {} },
    { month: "2026-07", order_count: 1, reference_value_cny: "12.50", known_item_count: 1, unknown_item_count: 0, reference_value_completeness: "complete", by_status: { pending: 1 } },
    { month: "2026-08", order_count: 2, reference_value_cny: "30.00", known_item_count: 2, unknown_item_count: 0, reference_value_completeness: "complete", by_status: { purchasing: 2 } },
    { month: "2026-09", order_count: 1, reference_value_cny: "18.10", known_item_count: 1, unknown_item_count: 1, reference_value_completeness: "partial", by_status: { receiving: 1 } },
    { month: "2026-10", order_count: 1, reference_value_cny: null, known_item_count: 0, unknown_item_count: 1, reference_value_completeness: "unavailable", by_status: { mystery: 1 } },
    { month: "2026-11", order_count: 1, reference_value_cny: "25.00", known_item_count: 1, unknown_item_count: 0, reference_value_completeness: "complete", by_status: { completed: 1 } },
  ],
  status_distribution: [{ status: "pending", count: 1 }, { status: "purchasing", count: 2 }, { status: "receiving", count: 1 }, { status: "mystery", count: 1 }, { status: "completed", count: 1 }],
  totals: { orders: 6, reference_value_cny: "85.60", known_item_count: 5, unknown_item_count: 2 },
  ...overrides,
});

describe("real customer dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    portalApi.getCustomerOrders.mockResolvedValue(success());
    portalApi.getCustomerDashboardAnalytics.mockResolvedValue(analytics());
  });

  it("renders real order statistics, recent orders, workflow, and working links", async () => {
    render(<RealCustomerDashboard account={account} routes={routes} />);

    expect(await screen.findByRole("link", { name: "Tổng đơn mua hộ: 11" })).toHaveAttribute("href", routes.orders);
    expect(screen.getByRole("link", { name: "Chờ tiếp nhận / xử lý: 6" })).toHaveAttribute("href", routes.orders);
    expect(screen.getByRole("link", { name: "Đang mua hàng: 2" })).toHaveAttribute("href", routes.orders);
    expect(screen.getByRole("link", { name: "Đang vận chuyển: 3" })).toHaveAttribute("href", routes.orders);
    expect(screen.getByText("婴儿墨镜配饰链")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Chưa có ảnh sản phẩm" })).toBeInTheDocument();
    expect(screen.getByText("Đang mua hàng", { selector: "li strong" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Tạo yêu cầu mua hộ/ })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /Tạo yêu cầu mua hộ/ })[0]).toHaveAttribute("href", routes.createOrder);
    expect(portalApi.getCustomerOrders).toHaveBeenCalledWith({ page: 1, per_page: 5 });
  });

  it("shows honest empty states and successful zero counts", async () => {
    portalApi.getCustomerOrders.mockResolvedValue(success({
      orders: [],
      statistics: { total: 0, by_status: {} },
    }));
    portalApi.getCustomerDashboardAnalytics.mockResolvedValue(analytics({
      monthly: analytics().monthly.map((entry) => ({ ...entry, order_count: 0, reference_value_cny: "0.00", known_item_count: 0, unknown_item_count: 0, by_status: {} })),
      status_distribution: [],
      totals: { orders: 0, reference_value_cny: "0.00", known_item_count: 0, unknown_item_count: 0 },
    }));

    render(<RealCustomerDashboard account={account} routes={routes} />);

    expect(await screen.findByRole("link", { name: "Tổng đơn mua hộ: 0" })).toBeInTheDocument();
    expect(screen.getByText("Bạn chưa có đơn hàng mua hộ")).toBeInTheDocument();
    expect(screen.getByText("Chưa có đơn đang xử lý")).toBeInTheDocument();
    expect(screen.getByText("Hiện chưa có yêu cầu nào cần bạn xử lý.")).toBeInTheDocument();
    expect(await screen.findAllByText("Chưa có dữ liệu trong kỳ")).toHaveLength(3);
  });

  it("does not turn an API failure into fake zeroes and can retry", async () => {
    portalApi.getCustomerOrders.mockRejectedValueOnce(new Error("Máy chủ tạm thời không phản hồi"));
    const user = userEvent.setup();
    render(<RealCustomerDashboard account={account} routes={routes} />);

    expect(await screen.findByText("Không thể tải dữ liệu đơn hàng")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tổng đơn mua hộ: không tải được" })).toHaveTextContent("—");
    expect(screen.getByText("Giỏ hàng đang trống. Dán link sản phẩm để bắt đầu yêu cầu mua hộ.")).toBeInTheDocument();

    portalApi.getCustomerOrders.mockResolvedValueOnce(success());
    await user.click(screen.getByRole("button", { name: /Thử lại/ }));
    expect(await screen.findByRole("link", { name: "Tổng đơn mua hộ: 11" })).toBeInTheDocument();
    expect(portalApi.getCustomerOrders).toHaveBeenCalledTimes(2);
  });

  it("keeps local cart and drafts isolated by customer id", async () => {
    const own = addItem(12, localItem());
    saveDraft(12, [own.item], "Giao giờ hành chính", "Đơn mùa đông");
    addItem(99, localItem({ title: "Không được lộ", quantity: 9, reference_price_cny: 99 }));

    render(<RealCustomerDashboard account={account} routes={routes} />);

    await screen.findByRole("link", { name: "Tổng đơn mua hộ: 11" });
    const cart = screen.getByRole("heading", { name: "Giỏ hàng của bạn" }).closest("section");
    expect(within(cart).getByText("2", { selector: "dd" })).toBeInTheDocument();
    expect(within(cart).getByText("25 CNY")).toBeInTheDocument();
    expect(within(cart).getAllByText("1", { selector: "dd" })).toHaveLength(2);
    expect(screen.queryByText("Không được lộ")).not.toBeInTheDocument();
  });

  it("keeps recent orders usable when statistics are absent", async () => {
    portalApi.getCustomerOrders.mockResolvedValue({ orders: [order()], pagination: {} });
    render(<RealCustomerDashboard account={account} routes={routes} />);

    expect(await screen.findByText("婴儿墨镜配饰链")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tổng đơn mua hộ: không tải được" })).toHaveTextContent("—");
    expect(screen.getByText("Chưa thể kiểm tra do dữ liệu đơn hàng chưa tải đầy đủ.")).toBeInTheDocument();
  });

  it("falls back after an image load failure without breaking the order row", async () => {
    portalApi.getCustomerOrders.mockResolvedValue(success({
      orders: [order({ items: [{ id: 2, product_name: "商品测试", product_image: "https://invalid.test/image.jpg", quantity: 1 }] })],
    }));
    render(<RealCustomerDashboard account={account} routes={routes} />);

    const image = await screen.findByRole("img", { name: "商品测试" });
    fireEvent.error(image);
    await waitFor(() => expect(screen.getByRole("img", { name: "Chưa có ảnh sản phẩm" })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Xem chi tiết REQ-00091" })).toHaveAttribute("href", `${routes.orderDetail}?id=91`);
  });

  it("renders three real charts, groups unknown statuses, and switches the shared period", async () => {
    const user = userEvent.setup();
    render(<RealCustomerDashboard account={account} routes={routes} />);

    expect(await screen.findByRole("img", { name: "Biểu đồ đường số đơn theo tháng" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Biểu đồ cột giá trị tham khảo CNY theo tháng" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Biểu đồ tròn phân bổ trạng thái đơn" })).toBeInTheDocument();
    expect(screen.getByText("Khác")).toBeInTheDocument();
    expect(screen.getByText(/2 mặt hàng chưa xác định giá/)).toBeInTheDocument();
    expect(portalApi.getCustomerDashboardAnalytics).toHaveBeenCalledWith(6);

    await user.hover(screen.getByRole("button", { name: "T9/26: 18,1 CNY" }));
    expect(screen.getByText("18,1 CNY · dữ liệu chưa đủ")).toBeInTheDocument();

    portalApi.getCustomerDashboardAnalytics.mockResolvedValueOnce(analytics({ period: { months: 3 }, monthly: analytics().monthly.slice(-3) }));
    await user.click(screen.getByRole("button", { name: "3 tháng" }));
    await waitFor(() => expect(portalApi.getCustomerDashboardAnalytics).toHaveBeenLastCalledWith(3));
    portalApi.getCustomerDashboardAnalytics.mockResolvedValueOnce(analytics({ period: { months: 12 }, monthly: analytics().monthly }));
    await user.click(screen.getByRole("button", { name: "12 tháng" }));
    await waitFor(() => expect(portalApi.getCustomerDashboardAnalytics).toHaveBeenLastCalledWith(12));
  });

  it("keeps recent orders visible when the analytics endpoint fails", async () => {
    portalApi.getCustomerDashboardAnalytics.mockRejectedValue(new Error("Không tải được thống kê"));
    render(<RealCustomerDashboard account={account} routes={routes} />);

    expect(await screen.findByText("婴儿墨镜配饰链")).toBeInTheDocument();
    expect(await screen.findAllByText("Không thể tải biểu đồ")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Tổng đơn mua hộ: 11" })).toBeInTheDocument();
  });
});
