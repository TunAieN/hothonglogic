export const helpCategories = [
  { id: "getting-started", icon: "laptop", title: "Bắt đầu mua hàng", description: "Tìm hiểu công cụ và những thông tin cần chuẩn bị." },
  { id: "ordering", icon: "cart", title: "Quy trình đặt hộ", description: "Chuẩn bị sản phẩm, yêu cầu đặt hàng và theo dõi xử lý." },
  { id: "shipping", icon: "package", title: "Vận chuyển ký gửi", description: "Nội dung ký gửi sẽ hiển thị sau khi quy trình được xác minh." },
  { id: "finance", icon: "wallet", title: "Tài chính & Thanh toán", description: "Thông tin thanh toán và công nợ theo cấu hình hệ thống." },
];

export const guides = [
  {
    id: "ordering-tool", slug: "cong-cu-dat-hang", status: "published", category: "getting-started", categoryLabel: "Bắt đầu mua hàng",
    title: "Làm quen với công cụ đặt hàng", description: "Tổng quan phạm vi hỗ trợ hiện có của Extension VietTrung Order.",
    keywords: ["extension", "cài công cụ", "cong cu", "taobao", "tmall", "giỏ hàng", "side panel"], thumbnail: null,
    highlights: ["Nhận diện trang sản phẩm được hỗ trợ", "Lưu sản phẩm vào giỏ cục bộ", "Chuẩn bị dữ liệu cho luồng tạo đơn"],
    steps: [
      { title: "Kiểm tra phạm vi hỗ trợ", description: "Extension hiện khai báo hỗ trợ trang sản phẩm Taobao và Tmall. Các nguồn khác chỉ được bổ sung sau khi tích hợp được xác minh.", image: null, imageAlt: "Ảnh phạm vi hỗ trợ công cụ", status: "published" },
      { title: "Cài đặt từ nguồn chính thức", description: "Liên kết phát hành công khai chưa được cấu hình. Không cài đặt từ nguồn không xác định; mục này sẽ được cập nhật khi có đường dẫn chính thức.", image: null, imageAlt: "Ảnh cài đặt công cụ", status: "pending" },
      { title: "Sử dụng giỏ hàng cục bộ", description: "Sau khi có quyền truy cập hợp lệ, công cụ có thể đọc thông tin sản phẩm được hỗ trợ, mở side panel và lưu giỏ hàng trong bộ nhớ Extension.", image: null, imageAlt: "Ảnh giỏ hàng của công cụ", status: "published" },
    ],
  },
  {
    id: "purchase-request", slug: "chuan-bi-yeu-cau-mua-ho", status: "published", category: "ordering", categoryLabel: "Quy trình đặt hộ",
    title: "Chuẩn bị yêu cầu mua hộ", description: "Những thông tin nên kiểm tra trước khi gửi yêu cầu về sản phẩm.",
    keywords: ["tạo đơn hàng", "tao don", "mua hộ", "link sản phẩm", "số lượng", "thuộc tính"], thumbnail: null,
    highlights: ["Chuẩn bị link sản phẩm", "Ghi rõ thuộc tính và số lượng", "Kiểm tra lại nội dung yêu cầu"],
    steps: [
      { title: "Chuẩn bị nguồn sản phẩm", description: "Lưu link sản phẩm và thông tin nhà cung cấp để bộ phận xử lý có đủ căn cứ kiểm tra yêu cầu.", image: null, imageAlt: "Ảnh link sản phẩm", status: "published" },
      { title: "Ghi rõ lựa chọn sản phẩm", description: "Chuẩn bị tên thuộc tính, màu sắc, kích thước và số lượng theo đúng thông tin hiển thị tại nguồn hàng.", image: null, imageAlt: "Ảnh thuộc tính sản phẩm", status: "published" },
      { title: "Xác nhận trên hệ thống", description: "Luồng gửi và xác nhận đơn dành cho khách hàng chưa có tài liệu nghiệp vụ công khai; hướng dẫn thao tác sẽ được cập nhật sau khi xác minh.", image: null, imageAlt: "Ảnh xác nhận yêu cầu", status: "pending" },
    ],
  },
  {
    id: "order-tracking", slug: "theo-doi-trang-thai-don", status: "published", category: "ordering", categoryLabel: "Quy trình đặt hộ",
    title: "Hiểu khu vực theo dõi đơn", description: "Cách sử dụng an toàn giao diện tra cứu trong giai đoạn chờ kết nối dữ liệu.",
    keywords: ["theo dõi đơn hàng", "tracking", "trạng thái", "mã đơn", "tra cứu"], thumbnail: null,
    highlights: ["Nhập mã đơn hợp lệ", "Nhận biết dữ liệu minh họa", "Chờ kết nối API khách hàng"],
    steps: [
      { title: "Mở khu vực tra cứu", description: "Khu vực theo dõi đơn hiện có trên trang chủ và kiểm tra định dạng mã trước khi gửi yêu cầu.", image: null, imageAlt: "Ảnh khu vực tra cứu", status: "published" },
      { title: "Phân biệt dữ liệu minh họa", description: "Timeline đang hiển thị nhãn dữ liệu minh họa và không được xem là trạng thái thực tế của một đơn hàng.", image: null, imageAlt: "Ảnh timeline minh họa", status: "published" },
      { title: "Tra cứu dữ liệu thực", description: "API khách hàng chưa được kết nối ở giao diện hiện tại. Kết quả thật sẽ chỉ xuất hiện sau khi hợp đồng API và quyền truy cập được hoàn thiện.", image: null, imageAlt: "Ảnh kết quả tra cứu", status: "pending" },
    ],
  },
  { id: "payment", slug: "thanh-toan", status: "coming-soon", category: "finance", title: "Thanh toán và công nợ", description: "Quy trình dành cho khách hàng đang chờ xác minh.", keywords: ["thanh toán", "công nợ", "đặt cọc"], thumbnail: null, highlights: [], steps: [] },
  { id: "consignment", slug: "ky-gui-hang", status: "coming-soon", category: "shipping", title: "Vận chuyển ký gửi", description: "Quy trình ký gửi đang chờ tài liệu nghiệp vụ chính thức.", keywords: ["ký gửi", "ky gui", "vận chuyển"], thumbnail: null, highlights: [], steps: [] },
];

export const helpVideos = [
  { id: "start", title: "Cách bắt đầu nhập hàng", description: "Video sẽ được bổ sung sau khi có tài nguyên chính thức.", url: null, thumbnail: null, duration: null, status: "coming-soon" },
  { id: "order", title: "Tạo yêu cầu đặt hàng", description: "Video sẽ được bổ sung sau khi quy trình khách hàng được xác minh.", url: null, thumbnail: null, duration: null, status: "coming-soon" },
  { id: "source", title: "Tìm hiểu nguồn hàng", description: "Video sẽ được bổ sung từ kênh chính thức của VietTrung Order.", url: null, thumbnail: null, duration: null, status: "coming-soon" },
];

export const helpFaqs = [
  { question: "Làm sao để đánh giá độ uy tín của nhà cung cấp?", answer: "Nên đối chiếu lịch sử hoạt động, đánh giá, thông tin sản phẩm và điều kiện giao dịch hiển thị tại nguồn hàng. VietTrung Order chưa công bố một thang điểm đảm bảo uy tín riêng." },
  { question: "Thời gian vận chuyển Trung Quốc – Việt Nam phụ thuộc vào yếu tố nào?", answer: "Thời gian có thể phụ thuộc tuyến vận chuyển, loại hàng, quá trình xử lý kho và điều kiện tại từng thời điểm. Thời hạn cụ thể cần căn cứ xác nhận của từng đơn." },
  { question: "Nếu hàng hóa bị hư hỏng hoặc thất lạc thì xử lý thế nào?", answer: "Khách hàng cần gửi yêu cầu hỗ trợ cùng thông tin liên quan. Việc xử lý áp dụng theo chính sách dịch vụ hiện hành sau khi được xác minh, không mặc định một mức đền bù." },
  { question: "Phí vận chuyển nội địa Trung Quốc được tính như thế nào?", answer: "Khoản phí này phụ thuộc nhà cung cấp, địa điểm giao và phương thức vận chuyển tại nguồn. Giá trị chính thức cần được thể hiện trong báo giá hoặc chứng từ của đơn." },
  { question: "Có thể đặt hàng từ những nền tảng nào?", answer: "Extension hiện khai báo hỗ trợ trang sản phẩm Taobao và Tmall. Kiến trúc website hướng tới đa nguồn hàng, nhưng nguồn khác chỉ được công bố khi tích hợp đã được xác minh." },
  { question: "Làm sao để theo dõi trạng thái đơn hàng?", answer: "Khu vực tra cứu hiện đang chờ kết nối API khách hàng. Timeline trên trang chủ có nhãn minh họa và không phải kết quả của đơn thực tế." },
];
