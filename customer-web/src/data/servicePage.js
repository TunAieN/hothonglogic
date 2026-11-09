import {
  BadgeDollarSign,
  Boxes,
  Calculator,
  ClipboardCheck,
  CreditCard,
  Link2,
  PackageCheck,
  ReceiptText,
  SearchCheck,
  ShieldCheck,
  Truck,
  WalletCards,
} from "lucide-react";

export const serviceBenefits = [
  { title: "Chi phí minh bạch", description: "Các khoản phí sẵn sàng hiển thị theo dữ liệu được xác nhận.", icon: ReceiptText },
  { title: "Vận chuyển thuận tiện", description: "Tổ chức hành trình và trạng thái giao nhận tập trung.", icon: Truck },
  { title: "Hỗ trợ xử lý đơn", description: "Theo dõi các bước tiếp nhận và xử lý đơn hàng.", icon: PackageCheck },
  { title: "Theo dõi & đối soát", description: "Tra cứu trạng thái và giao dịch theo quyền được cấp.", icon: SearchCheck },
];

export const servicePricing = [
  {
    id: "purchase",
    title: "Phí mua hộ",
    description: "Cách tính phụ thuộc nguồn hàng và yêu cầu xử lý của từng đơn.",
    value: null,
    icon: CreditCard,
  },
  {
    id: "shipping",
    title: "Phí vận chuyển Trung – Việt",
    description: "Cần xác định tuyến, loại hàng, trọng lượng hoặc thể tích.",
    value: null,
    icon: Truck,
  },
  {
    id: "additional",
    title: "Dịch vụ gia tăng",
    description: "Kiểm đếm, đóng gói và các yêu cầu khác được báo giá riêng.",
    value: null,
    icon: Boxes,
  },
];

export const serviceProcess = [
  { title: "Gửi link hoặc yêu cầu", description: "Cung cấp nguồn hàng và thông tin sản phẩm.", icon: Link2 },
  { title: "Nhận báo giá", description: "Kiểm tra nội dung và xác nhận phương án.", icon: BadgeDollarSign },
  { title: "Đặt cọc & xử lý", description: "Đơn được tiếp nhận theo luồng nghiệp vụ.", icon: WalletCards },
  { title: "Theo dõi & nhận hàng", description: "Nắm rõ các mốc vận chuyển và giao nhận.", icon: ClipboardCheck },
];

export const serviceTools = [
  {
    id: "extension",
    title: "Tiện ích đặt hàng",
    description: "Công cụ hiện có hỗ trợ lấy thông tin sản phẩm từ Taobao và Tmall.",
    icon: PackageCheck,
    tone: "featured",
  },
  {
    id: "calculator",
    title: "Công cụ tính chi phí",
    description: "Giao diện chuẩn bị cho quy đổi CNY/VND khi có tỷ giá được cấu hình.",
    icon: Calculator,
    tone: "default",
  },
  {
    id: "tracking",
    title: "Theo dõi đơn hàng",
    description: "Kiểm tra hành trình đơn khi API khách hàng được kết nối.",
    icon: SearchCheck,
    tone: "default",
  },
];

export const warehousePlaceholders = [
  { id: "china-warehouse", title: "Kho Trung Quốc", description: "Vị trí và hình ảnh sẽ được bổ sung sau khi xác minh.", image: null },
  { id: "vietnam-warehouse", title: "Kho Việt Nam", description: "Thông tin vận hành sẽ được cấu hình từ dữ liệu chính thức.", image: null },
  { id: "packing", title: "Đóng gói & vận chuyển", description: "Vùng ảnh dành cho quy trình xử lý kiện hàng.", image: null },
];

export const serviceTrustPoints = [
  { title: "Thông tin có nguồn", description: "Không hiển thị số liệu hoặc tuyên bố chưa được xác minh.", icon: ShieldCheck },
  { title: "Trạng thái rõ ràng", description: "Dữ liệu minh họa luôn được phân biệt với dữ liệu thật.", icon: ClipboardCheck },
];
