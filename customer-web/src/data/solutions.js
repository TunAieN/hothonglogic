import { Boxes, ClipboardCheck, CreditCard, Search, Truck, Warehouse } from "lucide-react";

export const solutions = [
  { id: "sourcing", title: "Tìm nguồn hàng đa nền tảng", description: "Một quy trình tiếp nhận linh hoạt cho nhiều nguồn hàng hiện tại và tương lai.", benefits: ["Gửi link hoặc yêu cầu", "Lưu thông tin sản phẩm", "Dễ mở rộng nguồn hàng"], icon: Search, image: null },
  { id: "payment", title: "Đặt hàng và thanh toán", description: "Theo dõi báo giá, đặt cọc và trạng thái xử lý trong cùng một luồng.", benefits: ["Báo giá rõ ràng", "Theo dõi đặt cọc", "Lịch sử giao dịch"], icon: CreditCard, image: null },
  { id: "packages", title: "Gom đơn và quản lý kiện", description: "Tổ chức nhiều kiện hàng theo đơn và chuẩn bị lộ trình vận chuyển phù hợp.", benefits: ["Nhóm kiện theo đơn", "Kiểm soát số lượng", "Hạn chế bỏ sót"], icon: Boxes, image: null },
  { id: "warehouse", title: "Kho Trung Quốc", description: "Quản lý trạng thái tiếp nhận và lưu kho trước khi hàng rời Trung Quốc.", benefits: ["Trạng thái nhập kho", "Mã kiện rõ ràng", "Theo dõi xử lý kho"], icon: Warehouse, image: null },
  { id: "transport", title: "Vận chuyển Trung – Việt", description: "Theo dõi từng chặng của kiện hàng trên hành trình về Việt Nam.", benefits: ["Tiến trình theo chặng", "Cập nhật trạng thái", "Dễ tra cứu"], icon: Truck, image: null },
  { id: "tracking", title: "Theo dõi và đối soát", description: "Tổng hợp trạng thái đơn, khoản phí và các mốc cập nhật quan trọng.", benefits: ["Dữ liệu tập trung", "Đối soát thuận tiện", "Sẵn sàng kết nối API"], icon: ClipboardCheck, image: null },
];
