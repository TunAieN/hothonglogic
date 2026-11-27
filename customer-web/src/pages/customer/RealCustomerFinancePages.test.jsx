import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCustomerTopupIntent, createVoucherSepayIntent, getCustomerFinanceSummary, getCustomerLedger,
  getCustomerPaymentIntent, getCustomerPaymentIntents, getCustomerPaymentVouchers, payVouchersFromWallet,
  payVoucherFromWallet,
} from "../../api/customerPortal.js";
import { PaymentQr, RealOrderPaymentsPage, RealWalletPage } from "./RealCustomerFinancePages.jsx";

vi.mock("../../api/customerPortal.js", () => ({
  createCustomerTopupIntent: vi.fn(), createVoucherSepayIntent: vi.fn(), estimateCustomerPricing: vi.fn(),
  getCustomerFinanceSummary: vi.fn(), getCustomerLedger: vi.fn(), getCustomerPaymentIntent: vi.fn(), getCustomerPaymentIntents: vi.fn(),
  getCustomerPaymentVouchers: vi.fn(), getCustomerPricing: vi.fn(), payVoucherFromWallet: vi.fn(), payVouchersFromWallet: vi.fn(),
}));

const intent = (overrides = {}) => ({
  reference: "VT0123456789ABCDEF01234567", amount_vnd: 100000, status: "pending",
  display_status: "pending", type: "wallet_topup", created_at: "2026-11-24T10:00:00+07:00", expires_at: "2099-11-24T18:30:00+07:00",
  qr_url: "https://vietqr.example/qr",
  bank: { name: "MBBank", code: "MB", account_number: "913042004", account_holder: "NGUYEN DINH TUAN ANH" },
  ...overrides,
});

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

afterEach(() => vi.useRealTimers());

describe("redesigned finance pages", () => {
  const vouchers = [
    { id: 1, code: "PT0001", type: "deposit", status: "waiting_payment", total_vnd: 200000, paid_vnd: 0, remaining_vnd: 200000, content: "Đặt cọc đơn #DH1", created_at: "2026-11-24T10:00:00+07:00" },
    { id: 2, code: "PT0002", type: "shipping", status: "waiting_payment", total_vnd: 150000, paid_vnd: 0, remaining_vnd: 150000, content: "Phí vận chuyển", created_at: "2026-11-23T10:00:00+07:00" },
    { id: 3, code: "PT0003", type: "order", status: "paid", total_vnd: 500000, paid_vnd: 500000, remaining_vnd: 0, content: "Thanh toán đơn", paid_at: "2026-11-24T11:00:00+07:00", created_at: "2026-11-22T10:00:00+07:00" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    getCustomerFinanceSummary.mockResolvedValue({ balance_vnd: 400000, outstanding_vnd: 350000, sepay_available: true, sepay_webhook_enabled: false });
    getCustomerPaymentVouchers.mockResolvedValue({ data: vouchers, meta: { total: 3, current_page: 1, last_page: 1 } });
    payVouchersFromWallet.mockResolvedValue({ intents: [] });
  });

  it("filters vouchers, disables settled rows and sends one atomic wallet checkout", async () => {
    render(<RealOrderPaymentsPage />);
    expect(await screen.findByText("PT0001")).toBeInTheDocument();
    expect(screen.getByText("Đã thanh toán (30 ngày)")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Chọn phiếu PT0003" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Chọn tất cả phiếu hợp lệ trên trang" }));
    fireEvent.click(screen.getByRole("button", { name: /Thanh toán \(Checkout\)/ }));
    expect(screen.getByRole("dialog", { name: "Xác nhận checkout nhiều phiếu" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thanh toán bằng số dư ví" }));
    await waitFor(() => expect(payVouchersFromWallet).toHaveBeenCalledTimes(1));
    expect(payVouchersFromWallet).toHaveBeenCalledWith(expect.objectContaining({ voucher_ids: [1, 2], idempotency_key: expect.any(String) }));
  });

  it("combines status and search filters without selecting ineligible vouchers", async () => {
    render(<RealOrderPaymentsPage />);
    await screen.findByText("PT0001");
    fireEvent.click(screen.getByRole("button", { name: /Đã thanh toán \(1\)/ }));
    expect(screen.getByText("PT0003")).toBeInTheDocument();
    expect(screen.queryByText("PT0001")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tìm phiếu thanh toán"), { target: { value: "không có" } });
    expect(screen.getByText("Không có phiếu phù hợp")).toBeInTheDocument();
  });

  it("offers wallet and VietQR in one modal and keeps bank available when wallet is short", async () => {
    getCustomerFinanceSummary.mockResolvedValue({
      balance_vnd: 100000, outstanding_vnd: 350000, sepay_available: true, sepay_webhook_enabled: true,
      deposit_auto_confirmation_enabled: true, direct_voucher_payment_enabled: true,
      payment_account: { bank_name: "MBBank", account_holder: "VIETTRUNG ORDER" },
    });
    createVoucherSepayIntent.mockResolvedValue({ intent: intent({ type: "voucher_payment", amount_vnd: 200000 }) });
    render(<RealOrderPaymentsPage />);
    await screen.findByText("PT0001");
    fireEvent.click(screen.getAllByRole("button", { name: "Thanh toán" })[0]);
    expect(screen.getByRole("dialog", { name: "Chọn phương thức thanh toán" })).toBeInTheDocument();
    expect(screen.getAllByText("Đặt cọc").length).toBeGreaterThan(0);
    expect(screen.getByText(/Ví còn thiếu 100\.000/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xác nhận thanh toán bằng ví" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Chuyển khoản VietQR/ }));
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục tạo mã VietQR" }));
    await waitFor(() => expect(createVoucherSepayIntent).toHaveBeenCalledWith(1, expect.objectContaining({ idempotency_key: expect.any(String) })));
    expect(payVoucherFromWallet).not.toHaveBeenCalled();
    expect(await screen.findByText("Mã QR thanh toán")).toBeInTheDocument();
  });
});

describe("PaymentQr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCustomerFinanceSummary.mockResolvedValue({ balance_vnd: 0, outstanding_vnd: 0, sepay_available: true, sepay_webhook_enabled: false });
    getCustomerLedger.mockResolvedValue({ data: [] });
    getCustomerPaymentIntents.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } });
  });

  it("shows exact QR fields, expiry and copy actions without promising automatic credit", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<PaymentQr intent={intent({ status: "completed", display_status: "completed" })} />);

    expect(screen.getAllByText("NGUYEN DINH TUAN ANH").length).toBeGreaterThan(0);
    expect(screen.getAllByText("913042004").length).toBeGreaterThan(0);
    expect(screen.getAllByText("100.000 ₫").length).toBeGreaterThan(0);
    expect(screen.getByText("Mã QR thanh toán")).toBeInTheDocument();
    expect(screen.getByText("Mã giao dịch")).toBeInTheDocument();
    expect(screen.getByText("Thời điểm hết hạn")).toBeInTheDocument();
    expect(screen.getByText(/Kênh xác nhận tự động đang tạm tắt/)).toBeInTheDocument();
    expect(screen.getByText("Giao dịch đã hoàn tất")).toBeInTheDocument();
    expect(screen.getByText("Khoản nạp đã được backend xác nhận.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /QR thanh toán/ })).not.toBeInTheDocument();
    expect(screen.getByText("Theo dõi trạng thái trên VietTrung Order.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sao chép mã giao dịch" }));
    fireEvent.click(screen.getByRole("button", { name: "Sao chép ngân hàng" }));
    fireEvent.click(screen.getByRole("button", { name: "Sao chép số tài khoản" }));
    fireEvent.click(screen.getByRole("button", { name: "Sao chép số tiền" }));
    fireEvent.click(screen.getByRole("button", { name: "Sao chép chủ tài khoản" }));
    fireEvent.click(screen.getByRole("button", { name: "Sao chép nội dung chuyển khoản" }));

    expect(writeText).toHaveBeenNthCalledWith(1, "VT0123456789ABCDEF01234567");
    expect(writeText).toHaveBeenNthCalledWith(2, "MBBank");
    expect(writeText).toHaveBeenNthCalledWith(3, "913042004");
    expect(writeText).toHaveBeenNthCalledWith(4, "100000");
    expect(writeText).toHaveBeenNthCalledWith(5, "NGUYEN DINH TUAN ANH");
    expect(writeText).toHaveBeenNthCalledWith(6, "VT0123456789ABCDEF01234567");
  });

  it("keeps one non-overlapping poll and stops after completion or unmount", async () => {
    vi.useFakeTimers();
    const response = deferred();
    const onCompleted = vi.fn();
    getCustomerPaymentIntent.mockReturnValueOnce(response.promise);
    const view = render(<StrictMode><PaymentQr intent={intent()} onCompleted={onCompleted} /></StrictMode>);

    await act(() => vi.advanceTimersByTimeAsync(8000));
    expect(getCustomerPaymentIntent).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(16000));
    expect(getCustomerPaymentIntent).toHaveBeenCalledTimes(1);

    await act(async () => { response.resolve({ intent: intent({ status: "completed", display_status: "completed" }) }); await response.promise; });
    expect(onCompleted).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(16000));
    expect(getCustomerPaymentIntent).toHaveBeenCalledTimes(1);

    view.unmount();
    await act(() => vi.advanceTimersByTimeAsync(16000));
    expect(getCustomerPaymentIntent).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("shows zero time without overriding the backend payment state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T10:00:00+07:00"));
    const onUpdated = vi.fn();
    render(<PaymentQr intent={intent({ expires_at: "2026-11-24T10:00:02+07:00" })} onUpdated={onUpdated} />);

    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByText("Đang chờ thanh toán")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /QR thanh toán/ })).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("keeps polling a pending intent without reporting completion", async () => {
    vi.useFakeTimers();
    const onCompleted = vi.fn();
    getCustomerPaymentIntent.mockResolvedValue({ intent: intent() });
    const view = render(<PaymentQr intent={intent()} onCompleted={onCompleted} />);

    await act(() => vi.advanceTimersByTimeAsync(8000));
    expect(getCustomerPaymentIntent).toHaveBeenCalledTimes(1);
    expect(onCompleted).not.toHaveBeenCalled();
    expect(screen.getByText("Đang chờ thanh toán")).toBeInTheDocument();

    view.unmount();
    vi.useRealTimers();
  });
});

describe("RealWalletPage intent creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCustomerFinanceSummary.mockResolvedValue({
      balance_vnd: 0, outstanding_vnd: 0, sepay_available: true, sepay_webhook_enabled: false,
      topup_rules: { min_vnd: 1000, max_vnd: 999999999999, step_vnd: 1000 },
      payment_account: { bank_name: "MBBank", bank_code: "MB" },
    });
    getCustomerLedger.mockResolvedValue({ data: [] });
    getCustomerPaymentIntents.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } });
  });

  const openTopup = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Nạp tiền" }));
    return screen.getByRole("button", { name: "Tiếp tục tạo mã QR" });
  };

  it("only POSTs after confirmation, ignores double click and never POSTs on render", async () => {
    const response = deferred();
    createCustomerTopupIntent.mockReturnValueOnce(response.promise);
    const view = render(<RealWalletPage />);
    await screen.findAllByText("Ví giao dịch");
    expect(createCustomerTopupIntent).not.toHaveBeenCalled();
    const button = await openTopup();
    await waitFor(() => expect(button).toBeEnabled());

    fireEvent.click(button);
    fireEvent.click(button);
    expect(createCustomerTopupIntent).toHaveBeenCalledTimes(1);
    view.rerender(<RealWalletPage />);
    expect(createCustomerTopupIntent).toHaveBeenCalledTimes(1);

    await act(async () => { response.resolve({ intent: intent() }); await response.promise; });
    expect(createCustomerTopupIntent).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("dialog", { name: "Thanh toán" })).toBeInTheDocument();
  });

  it("quick amount selection does not POST and a changed amount gets a fresh idempotency key", async () => {
    createCustomerTopupIntent
      .mockResolvedValueOnce({ intent: intent({ reference: "VTAAAAAAAAAAAAAAAAAAAAAAAA", amount_vnd: 10000 }) })
      .mockResolvedValueOnce({ intent: intent({ reference: "VTBBBBBBBBBBBBBBBBBBBBBBBB", amount_vnd: 100000 }) });
    render(<RealWalletPage />);
    await openTopup();
    const input = screen.getByRole("spinbutton", { name: /Số tiền nạp/ });
    fireEvent.change(input, { target: { value: "10000" } });
    expect(createCustomerTopupIntent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục tạo mã QR" }));
    await waitFor(() => expect(createCustomerTopupIntent).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Đóng hộp thoại" }));
    await openTopup();
    fireEvent.click(screen.getByRole("button", { name: /100\.000/ }));
    expect(createCustomerTopupIntent).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục tạo mã QR" }));
    await waitFor(() => expect(createCustomerTopupIntent).toHaveBeenCalledTimes(2));

    const [first, second] = createCustomerTopupIntent.mock.calls.map(([payload]) => payload);
    expect(first.amount_vnd).toBe(10000);
    expect(second.amount_vnd).toBe(100000);
    expect(second.idempotency_key).not.toBe(first.idempotency_key);
    expect(screen.getAllByText("VTBBBBBBBBBBBBBBBBBBBBBBBB").length).toBeGreaterThan(0);
  });

  it("does not retry a POST after HTTP 429 and holds the create action", async () => {
    const error = Object.assign(new Error("Too Many Attempts."), { status: 429, retryAfter: 30 });
    createCustomerTopupIntent.mockRejectedValueOnce(error);
    const view = render(<RealWalletPage />);
    const button = await openTopup();
    await waitFor(() => expect(button).toBeEnabled());

    fireEvent.click(button);
    expect(createCustomerTopupIntent).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("alert")).toHaveTextContent("tạm dừng 30 giây");
    expect(createCustomerTopupIntent).toHaveBeenCalledTimes(1);
    view.rerender(<RealWalletPage />);
    expect(createCustomerTopupIntent).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Vui lòng chờ" })).toBeDisabled();
  });

  it("opens an existing pending intent without creating another one and keeps its original expiry", async () => {
    const existing = intent({ reference: "VTEXISTINGPENDING000000001", expires_at: "2099-11-24T18:30:00+07:00" });
    getCustomerPaymentIntents.mockResolvedValue({ data: [existing], meta: { current_page: 1, last_page: 1, total: 1 } });
    render(<RealWalletPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Mở QR" }));
    expect(await screen.findByRole("dialog", { name: "Thanh toán" })).toBeInTheDocument();
    expect(screen.getByText("Quét mã QR để hoàn tất thanh toán")).toBeInTheDocument();
    expect(screen.getByText("Thời gian còn lại")).toBeInTheDocument();
    expect(createCustomerTopupIntent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Đóng hộp thoại" }));
    fireEvent.click(screen.getByRole("button", { name: "Mở QR" }));
    expect(screen.getByText("Thời gian còn lại")).toBeInTheDocument();
    expect(createCustomerTopupIntent).not.toHaveBeenCalled();
  });

  it("closes the QR modal, refetches backend data and shows one success toast when polling completes", async () => {
    const pending = intent({ amount_vnd: 10000 });
    const completed = intent({ amount_vnd: 10000, status: "completed", display_status: "completed" });
    getCustomerPaymentIntents
      .mockResolvedValueOnce({ data: [pending], meta: { current_page: 1, last_page: 1, total: 1 } })
      .mockResolvedValueOnce({ data: [completed], meta: { current_page: 1, last_page: 1, total: 1 } });
    getCustomerFinanceSummary
      .mockResolvedValueOnce({ balance_vnd: 0, outstanding_vnd: 0, sepay_available: true, sepay_webhook_enabled: true })
      .mockResolvedValueOnce({ balance_vnd: 10000, outstanding_vnd: 0, sepay_available: true, sepay_webhook_enabled: true });
    getCustomerPaymentIntent.mockResolvedValue({ intent: completed });

    render(<RealWalletPage />);
    const openButton = await screen.findByRole("button", { name: "Mở QR" });
    vi.useFakeTimers();
    fireEvent.click(openButton);
    expect(screen.getByRole("dialog", { name: "Thanh toán" })).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(8000));
    await act(async () => Promise.resolve());

    expect(screen.queryByRole("dialog", { name: "Thanh toán" })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Nạp tiền thành công/)).toHaveLength(1);
    expect(screen.getByText(/10\.000.*đã được ghi nhận vào ví/)).toBeInTheDocument();
    expect(getCustomerFinanceSummary).toHaveBeenCalledTimes(2);
    expect(getCustomerPaymentIntents).toHaveBeenCalledTimes(2);
    expect(getCustomerPaymentIntent).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("10.000 ₫").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Thành công").length).toBeGreaterThanOrEqual(1);

    await act(() => vi.advanceTimersByTimeAsync(16000));
    expect(getCustomerPaymentIntent).toHaveBeenCalledTimes(1);
    expect(createCustomerTopupIntent).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("opens completed history as read-only details without polling, POSTing or replaying the success toast", async () => {
    const completed = intent({ status: "completed", display_status: "completed" });
    getCustomerPaymentIntents.mockResolvedValue({ data: [completed], meta: { current_page: 1, last_page: 1, total: 1 } });

    render(<RealWalletPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Chi tiết" }));

    expect(screen.getByRole("dialog", { name: "Thanh toán" })).toBeInTheDocument();
    expect(screen.getByText("Giao dịch đã hoàn tất")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /QR thanh toán/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Nạp tiền thành công/)).not.toBeInTheDocument();
    expect(getCustomerPaymentIntent).not.toHaveBeenCalled();
    expect(createCustomerTopupIntent).not.toHaveBeenCalled();
  });

  it("keeps the modal closed and offers a refresh retry when post-completion data refresh fails", async () => {
    const pending = intent({ amount_vnd: 10000 });
    const completed = intent({ amount_vnd: 10000, status: "completed", display_status: "completed" });
    getCustomerPaymentIntents
      .mockResolvedValueOnce({ data: [pending], meta: { current_page: 1, last_page: 1, total: 1 } })
      .mockResolvedValueOnce({ data: [completed], meta: { current_page: 1, last_page: 1, total: 1 } });
    getCustomerFinanceSummary
      .mockResolvedValueOnce({ balance_vnd: 0, outstanding_vnd: 0, sepay_available: true, sepay_webhook_enabled: true })
      .mockRejectedValueOnce(new Error("summary unavailable"));
    getCustomerPaymentIntent.mockResolvedValue({ intent: completed });

    render(<RealWalletPage />);
    const openButton = await screen.findByRole("button", { name: "Mở QR" });
    vi.useFakeTimers();
    fireEvent.click(openButton);
    await act(() => vi.advanceTimersByTimeAsync(8000));
    await act(async () => Promise.resolve());

    expect(screen.queryByRole("dialog", { name: "Thanh toán" })).not.toBeInTheDocument();
    expect(screen.getByText(/Nạp tiền thành công/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("chưa thể làm mới đầy đủ số dư và lịch sử");
    expect(screen.getByRole("button", { name: /Thử lại/ })).toBeInTheDocument();
    expect(createCustomerTopupIntent).not.toHaveBeenCalled();
    expect(getCustomerLedger).not.toHaveBeenCalled();
  });

  it("does not show a success toast for an expired transaction", async () => {
    const expired = intent({ status: "expired", display_status: "expired", qr_url: null });
    getCustomerPaymentIntents.mockResolvedValue({ data: [expired], meta: { current_page: 1, last_page: 1, total: 1 } });

    render(<RealWalletPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Chi tiết" }));

    expect(screen.getAllByText("QR đã hết hạn").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Nạp tiền thành công/)).not.toBeInTheDocument();
    expect(getCustomerPaymentIntent).not.toHaveBeenCalled();
    expect(createCustomerTopupIntent).not.toHaveBeenCalled();
  });

  it("sends transaction filters to the customer-scoped list endpoint", async () => {
    render(<RealWalletPage />);
    await screen.findByText("0 giao dịch trong kết quả hiện tại");
    fireEvent.change(screen.getByLabelText("Trạng thái"), { target: { value: "expired" } });
    fireEvent.change(screen.getByPlaceholderText("Nhập mã tham chiếu"), { target: { value: "VT123" } });
    fireEvent.click(screen.getByRole("button", { name: "Áp dụng" }));
    await waitFor(() => expect(getCustomerPaymentIntents).toHaveBeenLastCalledWith(expect.objectContaining({ status: "expired", search: "VT123", page: 1, per_page: 10 })));
  });

  it("paginates with the existing list endpoint and never requests ledger data", async () => {
    const rows = Array.from({ length: 25 }, (_, index) => intent({
      reference: `VT${String(25 - index).padStart(22, "0")}`,
      amount_vnd: (index + 1) * 10000,
      status: "completed",
      display_status: "completed",
    }));
    getCustomerPaymentIntents.mockImplementation(({ page = 1, per_page: perPage = 10 }) => {
      const start = (page - 1) * perPage;
      return Promise.resolve({
        data: rows.slice(start, start + perPage),
        meta: { current_page: page, last_page: Math.ceil(rows.length / perPage), total: rows.length },
      });
    });

    render(<RealWalletPage />);
    expect(await screen.findByText("Hiển thị 1–10 trong tổng số 25 giao dịch")).toBeInTheDocument();
    expect(getCustomerLedger).not.toHaveBeenCalled();
    expect(screen.queryByText("Biến động số dư")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Trang 3" }));
    expect(await screen.findByText("Hiển thị 21–25 trong tổng số 25 giao dịch")).toBeInTheDocument();
    expect(getCustomerPaymentIntents).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3, per_page: 10 }));
    expect(screen.getByRole("button", { name: "Sau" })).toBeDisabled();
    expect(createCustomerTopupIntent).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("combobox", { name: "Số dòng mỗi trang" }), { target: { value: "20" } });
    expect(await screen.findByText("Hiển thị 1–20 trong tổng số 25 giao dịch")).toBeInTheDocument();
    expect(getCustomerPaymentIntents).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, per_page: 20 }));
    expect(createCustomerTopupIntent).not.toHaveBeenCalled();
  });

  it("shows a single disabled page for a result set smaller than the default page size", async () => {
    const rows = Array.from({ length: 7 }, (_, index) => intent({ reference: `VTSEVEN${String(index).padStart(17, "0")}` }));
    getCustomerPaymentIntents.mockResolvedValue({ data: rows, meta: { current_page: 1, last_page: 1, total: 7 } });

    render(<RealWalletPage />);
    expect(await screen.findByText("Hiển thị 1–7 trong tổng số 7 giao dịch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trang 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Trước" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sau" })).toBeDisabled();
  });
});
