import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomerPortalPage from "./CustomerPortalPage.jsx";
import { changeCustomerPassword, getCustomerSession } from "../../api/customerAuth.js";

vi.mock("../../api/customerAuth.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, changeCustomerPassword: vi.fn(), getCustomerSession: vi.fn(), logoutCustomer: vi.fn() };
});

describe("real customer account and security page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/tai-khoan/cai-dat/");
    getCustomerSession.mockResolvedValue({ account: {
      id: 1, customer_id: 7, customer_code: "THY5218", name: "Trịnh Hải Yến",
      email: "haiyen@example.test", phone: "+84988112233", status: "active", email_verified: true,
    } });
    changeCustomerPassword.mockResolvedValue({ message: "Đổi mật khẩu thành công." });
  });

  it("shows backend account data as read-only and toggles each password independently", async () => {
    render(<CustomerPortalPage />);
    expect(await screen.findByDisplayValue("Trịnh Hải Yến")).toHaveAttribute("readonly");
    expect(screen.getByDisplayValue("THY5218")).toHaveAttribute("readonly");
    expect(screen.getByText("Đã xác thực email")).toBeInTheDocument();

    const current = screen.getByLabelText("Mật khẩu hiện tại");
    const next = screen.getByLabelText("Mật khẩu mới");
    expect(current).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Hiện mật khẩu hiện tại" }));
    expect(current).toHaveAttribute("type", "text");
    expect(next).toHaveAttribute("type", "password");
  });

  it("keeps the existing password API and validation contract", async () => {
    render(<CustomerPortalPage />);
    await screen.findByDisplayValue("THY5218");
    fireEvent.change(screen.getByLabelText("Mật khẩu hiện tại"), { target: { value: "CurrentPassword!" } });
    fireEvent.change(screen.getByLabelText("Mật khẩu mới"), { target: { value: "NewPassword!123" } });
    fireEvent.change(screen.getByLabelText("Xác nhận mật khẩu mới"), { target: { value: "NewPassword!123" } });
    fireEvent.click(screen.getByRole("button", { name: "Đổi mật khẩu" }));

    await waitFor(() => expect(changeCustomerPassword).toHaveBeenCalledWith({
      current_password: "CurrentPassword!", password: "NewPassword!123", password_confirmation: "NewPassword!123",
    }));
    expect(screen.getByText("Đổi mật khẩu thành công.")).toBeInTheDocument();
  });
});
