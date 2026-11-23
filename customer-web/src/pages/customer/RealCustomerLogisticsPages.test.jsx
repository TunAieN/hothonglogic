import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as portalApi from "../../api/customerPortal.js";
import { ConsignmentComingSoon, OrderShipmentPanel, RealConsignmentsPage, RealTrackingPage } from "./RealCustomerLogisticsPages.jsx";

vi.mock("../../api/customerPortal.js", async () => {
  const actual = await vi.importActual("../../api/customerPortal.js");
  return {
    ...actual,
    getCustomerWarehousePackages: vi.fn(), getCustomerWarehousePackage: vi.fn(),
    searchCustomerTracking: vi.fn(), getCustomerOrderShipments: vi.fn(),
  };
});

const routes = { orders: "/tai-khoan/don-mua-ho", orderDetail: "/tai-khoan/don-mua-ho/chi-tiet", consignments: "/tai-khoan/ky-gui", tracking: "/tai-khoan/tra-cuu" };
const packageItem = {
  id: 21, display_code: "ID kiện #21", tracking_number: "YT123456", carrier: "YTO",
  order: { id: 91, code: "REQ-00091" }, status: { key: "in_transit", label: "Đang vận chuyển về Việt Nam" },
  warehouse: { stage: "transit", label: "Trên đường Trung Quốc → Việt Nam" }, weight_kg: 2.35,
  received_cn_at: "2026-11-18T08:00:00Z", latest_event_at: "2026-11-20T08:00:00Z", recorded_at: "2026-11-17T08:00:00Z", has_vn_record: false,
};
const packageDetail = {
  ...packageItem,
  products: [{ id: 4, name: "儿童保暖外套超长商品名称", image: null, variant: "Đỏ / L", quantity: 2 }],
  batch: { code: "CNB-001", status: "exporting", route_name: "Quảng Châu → Hà Nội", origin: "Kho Quảng Châu", destination: "Kho Hà Nội", departed_at: "2026-11-20T08:00:00Z", expected_arrival_at: "2026-11-25T08:00:00Z", arrived_at: null },
  domestic_delivery: null,
  timeline: [
    { key: "tracking_recorded", label: "Nhân viên ghi nhận mã vận đơn", occurred_at: "2026-11-17T08:00:00Z", location: null, kind: "event" },
    { key: "cn_received", label: "Kho Trung Quốc nhận kiện", occurred_at: "2026-11-18T08:00:00Z", location: "Kho Quảng Châu", kind: "event" },
    { key: "batch_eta", label: "Dự kiến đến Việt Nam", occurred_at: "2026-11-25T08:00:00Z", location: "Kho Hà Nội", kind: "estimate" },
  ],
};
const listResponse = { packages: [packageItem], pagination: { current_page: 1, last_page: 2, per_page: 10, total: 11 }, statistics: { total: 11, cn_received: 8, in_transit: 3, vn_received: 2 } };
const trackingResponse = { results: [{ key: "tracking-3", tracking: { id: 3, number: "YT123456", carrier: "YTO", status: "received", recorded_at: "2026-11-17T08:00:00Z", dispatched_at: "2026-11-17T10:00:00Z" }, order: { id: 91, code: "REQ-00091" }, packages: [packageDetail, { ...packageDetail, id: 22, display_code: "ID kiện #22" }], timeline: [] }] };
const deferred = () => { let resolve; let reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const responseFor = (number) => ({ results: [{ key: `tracking-${number}`, tracking: { id: number, number, carrier: "YTO", status: "received", recorded_at: "2026-11-17T08:00:00Z", dispatched_at: null }, order: { id: 91, code: `REQ-${number}` }, packages: [], timeline: [] }] });

describe("real customer logistics pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/tai-khoan/ky-gui");
    portalApi.getCustomerWarehousePackages.mockResolvedValue(listResponse);
    portalApi.getCustomerWarehousePackage.mockResolvedValue({ package: packageDetail });
    portalApi.searchCustomerTracking.mockResolvedValue(trackingResponse);
    portalApi.getCustomerOrderShipments.mockResolvedValue(trackingResponse);
  });
  afterEach(() => vi.useRealTimers());

  it("renders real package statistics and server-side list actions", async () => {
    const user = userEvent.setup();
    render(<RealConsignmentsPage routes={routes} />);

    expect((await screen.findAllByText("YT123456")).length).toBeGreaterThan(0);
    expect(screen.getByText("11", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getAllByText("Trên đường Trung Quốc → Việt Nam").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Hành trình/ })[0]).toHaveAttribute("href", "/tai-khoan/tra-cuu?code=YT123456");

    await user.type(screen.getByPlaceholderText("REQ-..."), "REQ-00091");
    await user.click(screen.getByRole("button", { name: "Lọc" }));
    await waitFor(() => expect(portalApi.getCustomerWarehousePackages).toHaveBeenLastCalledWith(expect.objectContaining({ order_code: "REQ-00091", page: 1, per_page: 10 })));
  });

  it("opens package detail, preserves Chinese product text, and copies tracking", async () => {
    const user = userEvent.setup();
    render(<RealConsignmentsPage routes={routes} />);
    await screen.findAllByText("YT123456");
    await user.click(screen.getAllByRole("button", { name: "Chi tiết" })[0]);

    const dialog = await screen.findByRole("dialog", { name: "Chi tiết kiện hàng" });
    expect(within(dialog).getByText("儿童保暖外套超长商品名称")).toBeInTheDocument();
    expect(within(dialog).getByText("Dự kiến, chưa phải sự kiện đã hoàn thành")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Sao chép" }));
    expect(within(dialog).getByRole("button", { name: "Đã sao chép" })).toBeInTheDocument();
  });

  it("searches an owned order and switches between multiple physical packages", async () => {
    window.history.replaceState(null, "", "/tai-khoan/tra-cuu?code=REQ-00091");
    const user = userEvent.setup();
    render(<RealTrackingPage routes={routes} />);

    expect(await screen.findByText("CNB-001")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tra cứu hành trình" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hành trình chi tiết" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thông tin lô hàng" })).toBeInTheDocument();
    expect(screen.getByText("Xuất kho TQ")).toBeInTheDocument();
    expect(screen.getAllByText("Chưa xác minh", { selector: "small" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "ID kiện #22" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ID kiện #22" }));
    expect(screen.getByText("ID kiện #22", { selector: "dd" })).toBeInTheDocument();
    expect(portalApi.searchCustomerTracking).toHaveBeenCalledWith("REQ-00091", expect.objectContaining({ signal: expect.anything() }));
  });

  it("automatically searches a pasted code after 600ms and renders no search button", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/tai-khoan/tra-cuu");
    render(<RealTrackingPage routes={routes} />);
    const input = screen.getByRole("textbox", { name: "Mã cần tra cứu" });

    fireEvent.change(input, { target: { value: "  TA6327563  " } });
    expect(screen.queryByRole("button", { name: /^Tra cứu$/ })).not.toBeInTheDocument();
    expect(portalApi.searchCustomerTracking).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(599); await Promise.resolve(); });
    expect(portalApi.searchCustomerTracking).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); await Promise.resolve(); await Promise.resolve(); });
    expect(portalApi.searchCustomerTracking).toHaveBeenCalledTimes(1);
    expect(portalApi.searchCustomerTracking).toHaveBeenCalledWith("TA6327563", expect.objectContaining({ signal: expect.anything() }));
  });

  it("debounces character-by-character input and does not search an empty value", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/tai-khoan/tra-cuu");
    render(<RealTrackingPage routes={routes} />);
    const input = screen.getByRole("textbox", { name: "Mã cần tra cứu" });

    for (const value of ["T", "TA", "TA6", "TA63"]) {
      fireEvent.change(input, { target: { value } });
      await act(async () => { vi.advanceTimersByTime(250); await Promise.resolve(); });
    }
    expect(portalApi.searchCustomerTracking).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(600); await Promise.resolve(); await Promise.resolve(); });
    expect(portalApi.searchCustomerTracking).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Xóa mã tra cứu" }));
    await act(async () => { vi.advanceTimersByTime(800); await Promise.resolve(); });
    expect(portalApi.searchCustomerTracking).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("");
  });

  it("ignores a late response for code A after code B is entered", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/tai-khoan/tra-cuu");
    const first = deferred(); const second = deferred();
    portalApi.searchCustomerTracking.mockImplementation((code) => code === "CODE-A" ? first.promise : second.promise);
    render(<RealTrackingPage routes={routes} />);
    const input = screen.getByRole("textbox", { name: "Mã cần tra cứu" });

    fireEvent.change(input, { target: { value: "CODE-A" } });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(600); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(portalApi.searchCustomerTracking).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: "CODE-B" } });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(600); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(portalApi.searchCustomerTracking).toHaveBeenCalledTimes(2);

    await act(async () => { second.resolve(responseFor("CODE-B")); await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getAllByText("CODE-B").length).toBeGreaterThan(0);
    await act(async () => { first.resolve(responseFor("CODE-A")); await Promise.resolve(); await Promise.resolve(); });
    expect(screen.queryByText("CODE-A")).not.toBeInTheDocument();
    expect(screen.getAllByText("CODE-B").length).toBeGreaterThan(0);
  });

  it("does not search during IME composition and starts debounce when composition ends", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/tai-khoan/tra-cuu");
    render(<RealTrackingPage routes={routes} />);
    const input = screen.getByRole("textbox", { name: "Mã cần tra cứu" });

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "包裹123" } });
    await act(async () => { vi.advanceTimersByTime(1000); await Promise.resolve(); });
    expect(portalApi.searchCustomerTracking).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input, { data: "包裹123" });
    await act(async () => { vi.advanceTimersByTime(600); await Promise.resolve(); await Promise.resolve(); });
    expect(portalApi.searchCustomerTracking).toHaveBeenCalledWith("包裹123", expect.objectContaining({ signal: expect.anything() }));
  });

  it("aborts an in-flight request and clears stale results when the code is removed", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/tai-khoan/tra-cuu");
    const pending = deferred();
    portalApi.searchCustomerTracking.mockReturnValue(pending.promise);
    render(<RealTrackingPage routes={routes} />);
    const input = screen.getByRole("textbox", { name: "Mã cần tra cứu" });

    fireEvent.change(input, { target: { value: "CLEAR-ME" } });
    await act(async () => { await Promise.resolve(); vi.advanceTimersByTime(600); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const signal = portalApi.searchCustomerTracking.mock.calls[0][1].signal;
    expect(signal.aborted).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Xóa mã tra cứu" }));
    expect(signal.aborted).toBe(true);
    expect(input).toHaveValue("");

    await act(async () => { pending.resolve(responseFor("CLEAR-ME")); await Promise.resolve(); await Promise.resolve(); });
    expect(screen.queryByText("CLEAR-ME")).not.toBeInTheDocument();
    expect(screen.getByText("Theo dõi từ dữ liệu kho vận thực tế")).toBeInTheDocument();
  });

  it("uses a neutral not-found state and keeps retry available on API errors", async () => {
    window.history.replaceState(null, "", "/tai-khoan/tra-cuu?code=SECRET-OTHER");
    portalApi.searchCustomerTracking.mockResolvedValueOnce({ results: [] });
    const first = render(<RealTrackingPage routes={routes} />);
    expect(await screen.findByText("Không tìm thấy hành trình phù hợp trong tài khoản của bạn")).toBeInTheDocument();
    first.unmount();

    portalApi.searchCustomerTracking.mockRejectedValueOnce(new Error("Máy chủ tạm thời không phản hồi"));
    render(<RealTrackingPage routes={routes} />);
    expect(await screen.findByText("Không thể tải dữ liệu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Thử lại/ })).toBeInTheDocument();
  });

  it("keeps self-declaration disabled and shows order shipment linkage", async () => {
    const view = render(<ConsignmentComingSoon routes={routes} />);
    expect(screen.getByText("Tạm hoãn triển khai")).toBeInTheDocument();
    expect(document.querySelector("form")).toBeNull();
    view.unmount();

    render(<OrderShipmentPanel orderId={91} routes={routes} />);
    expect(await screen.findByText("Vận đơn & kiện hàng")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Theo dõi vận chuyển/ })).toHaveAttribute("href", "/tai-khoan/tra-cuu?code=REQ-00091");
  });
});
