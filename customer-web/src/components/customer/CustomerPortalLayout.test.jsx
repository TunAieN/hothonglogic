import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomerPortalLayout from "./CustomerPortalLayout.jsx";

vi.mock("../../hooks/useCustomerCart.js", () => ({
  default: () => ({ totals: { itemCount: 0 } }),
}));

const profile = { customer_id: 1, initials: "HY" };

describe("CustomerPortalLayout sidebar groups", () => {
  beforeEach(() => window.history.replaceState({}, "", "/tai-khoan/vi/"));

  it("opens the four primary groups by default and keeps Account collapsed", () => {
    render(<CustomerPortalLayout profile={profile}><div>Nội dung</div></CustomerPortalLayout>);

    expect(screen.getByRole("button", { name: "Tổng quan" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Mua hộ" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Kho & vận chuyển" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Tài chính" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Tài khoản" })).toHaveAttribute("aria-expanded", "false");
  });

  it("lets each group toggle independently, preserves it during the mounted session, and resets on remount", () => {
    const view = render(<CustomerPortalLayout profile={profile}><div>Nội dung</div></CustomerPortalLayout>);
    const purchase = screen.getByRole("button", { name: "Mua hộ" });
    fireEvent.click(purchase);
    expect(purchase).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Tài chính" })).toHaveAttribute("aria-expanded", "true");

    window.history.pushState({}, "", "/tai-khoan/kho/tra-cuu-hanh-trinh/");
    view.rerender(<CustomerPortalLayout profile={profile}><div>Trang khác</div></CustomerPortalLayout>);
    expect(screen.getByRole("button", { name: "Mua hộ" })).toHaveAttribute("aria-expanded", "false");

    view.unmount();
    render(<CustomerPortalLayout profile={profile}><div>Tải lại</div></CustomerPortalLayout>);
    expect(screen.getByRole("button", { name: "Mua hộ" })).toHaveAttribute("aria-expanded", "true");
  });
});
