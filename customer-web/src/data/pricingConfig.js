import { Boxes, PackageCheck, SearchCheck, ShieldCheck } from "lucide-react";

export const pricingConfig = {
  status: "unavailable",
  exchangeRate: {
    fromCurrency: "CNY",
    toCurrency: "VND",
    value: null,
    updatedAt: null,
    source: "customer-api-pending",
  },
  customerTypes: [
    { id: "retail", label: "Khách lẻ / Mua hộ" },
    { id: "wholesale", label: "Khách sỉ / Ký gửi" },
  ],
  purchaseFeeRules: {
    retail: [],
    wholesale: [],
  },
  shippingRates: {
    kg: [],
    m3: [],
  },
  destinations: [],
  shippingMethods: [],
};

export const additionalServices = [
  { id: "inspection", title: "Kiểm hàng", description: "Kiểm tra số lượng hoặc ngoại quan theo yêu cầu.", status: "contact", price: null, icon: SearchCheck },
  { id: "packing", title: "Đóng gói / Đóng kiện", description: "Gia cố kiện hàng theo đặc điểm hàng hóa.", status: "contact", price: null, icon: Boxes },
  { id: "insurance", title: "Bảo hiểm hàng hóa", description: "Điều kiện áp dụng cần theo chính sách được xác nhận.", status: "unavailable", price: null, icon: ShieldCheck },
  { id: "storage", title: "Lưu kho", description: "Thời gian và mức phí chờ cấu hình chính thức.", status: "unavailable", price: null, icon: PackageCheck },
];

export const pricingNotes = [
  { id: "weight", title: "Cách tính cân nặng", description: "Quy tắc làm tròn và cân nặng tính cước chưa được cấu hình cho khách hàng.", icon: PackageCheck },
  { id: "bulky", title: "Hàng cồng kềnh", description: "Công thức thể tích hoặc trọng lượng quy đổi cần chính sách hiện hành.", icon: Boxes },
  { id: "claims", title: "Khiếu nại & đền bù", description: "Điều kiện xử lý cần được dẫn chiếu từ chính sách đã xác minh.", icon: ShieldCheck },
];
