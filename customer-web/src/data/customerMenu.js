import { Bell, BookOpenCheck, Boxes, CircleUserRound, ClipboardList, CreditCard, FileClock, Headphones, House, MapPin, PackagePlus, SearchCheck, ShoppingBag, ShoppingCart, Tags, WalletCards } from "lucide-react";
import { getPortalRoutes, portalRoutes } from "../config/customerPortal.js";

export const customerMenuGroups = [
  { id: "main", label: "Tổng quan", items: [{ id: "overview", label: "Tổng quan", icon: House }] },
  { id: "purchase", label: "Mua hộ", items: [
    { id: "createOrder", label: "Tạo yêu cầu mua hộ", icon: PackagePlus },
    { id: "cart", label: "Giỏ hàng & bản nháp", icon: ShoppingCart },
    { id: "orders", label: "Đơn hàng mua hộ", icon: ShoppingBag },
    { id: "orderHistory", label: "Lịch sử đơn hàng", icon: FileClock },
  ] },
  { id: "logistics", label: "Kho & vận chuyển", items: [
    { id: "consignmentCreate", label: "Khai báo ký gửi", icon: ClipboardList },
    { id: "consignments", label: "Danh sách ký gửi", icon: Boxes },
    { id: "tracking", label: "Tra cứu hành trình", icon: SearchCheck },
  ] },
  { id: "finance", label: "Tài chính", items: [
    { id: "wallet", label: "Ví & giao dịch", icon: WalletCards },
    { id: "orderPayments", label: "Thanh toán đơn", icon: CreditCard },
    { id: "pricing", label: "Bảng giá & ước tính", icon: Tags },
  ] },
  { id: "account", label: "Tài khoản", items: [
    { id: "addresses", label: "Sổ địa chỉ", icon: MapPin },
    { id: "notifications", label: "Thông báo", icon: Bell },
    { id: "settings", label: "Tài khoản & bảo mật", icon: CircleUserRound },
    { id: "support", label: "Yêu cầu hỗ trợ", icon: Headphones },
  ] },
];

export function getCustomerMenuGroups(pathname) {
  const routes = getPortalRoutes(pathname);
  return customerMenuGroups.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item, href: routes[item.id] })) }));
}

export function getCustomerMenu(pathname) { return getCustomerMenuGroups(pathname).flatMap((group) => group.items); }
export const customerMenu = customerMenuGroups.flatMap((group) => group.items.map((item) => ({ ...item, href: portalRoutes[item.id] })));
export const customerSupportLink = { label: "Trung tâm hướng dẫn", href: "/huong-dan", icon: BookOpenCheck };
