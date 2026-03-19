# GIẢI MÃ CONTENT SCRIPT (content.js)

File `content.js` là "trái tim" của Extension, chịu trách nhiệm chạy trực tiếp trên trang Taobao/Tmall để đọc mã nguồn HTML và trích xuất dữ liệu sản phẩm.

Dưới đây là giải thích chi tiết từng hàm và logic hoạt động:

## 1. Hàm Phụ Trợ: `getElementByXPath(xpath)`

```javascript
function getElementByXPath(xpath) {
    const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
    );
    return result.singleNodeValue;
}
```
- **Mục đích**: Tìm kiếm một phần tử HTML bằng ngôn ngữ **XPath** thay vì CSS Selector thông thường.
- **Tại sao cần?**: Taobao sử dụng cấu trúc DOM rất động (dynamic field), class name thường xuyên thay đổi hoặc bị mã hóa (ví dụ `ItemTitle--mainTitle--eeKBcVN`). XPath cho phép tìm theo vị trí phân cấp chính xác (ví dụ: `span thứ 3 trong div thứ 1...`), giúp lấy dữ liệu chính xác hơn khi class thay đổi.
- **Cách dùng**: Truyền chuỗi XPath vào -> Trả về phần tử HTML tìm thấy đầu tiên.

## 2. Hàm Chính: `extractProductInfo()`

Đây là hàm quan trọng nhất, thực hiện toàn bộ logic "Cào" dữ liệu.

### Bước 1: Khởi tạo
```javascript
const productData = {
    url: window.location.href, // Lấy link hiện tại
    timestamp: new Date().toISOString() // Thời gian lấy
};
```

### Bước 2: Lấy Tên Sản Phẩm (Title)
Hàm sử dụng chiến thuật "2 lớp bảo vệ": lấy bằng XPath trước, nếu không được thì dùng CSS Selector.

1.  **Thử XPath (Ưu tiên)**:
    - Sử dụng các XPath đã được kiểm chứng (ví dụ: `//*[@id="tbpcDetail_SkuPanelBody"]...`).
    - Nếu tìm thấy -> Lưu vào `productData.title` và dừng tìm kiếm.
2.  **Thử CSS Selector (Dự phòng)**:
    - Nếu XPath thất bại, duyệt qua danh sách các class phổ biến (`.tb-main-title`, `h1`...).
    - Điều này giúp Extension vẫn hoạt động được trên các trang cũ hoặc giao diện khác của Taobao.

### Bước 3: Lấy Giá (Price)
Tương tự Title, áp dụng chiến thuật 2 lớp:
1.  **XPath**: Lấy chính xác con số từ vị trí cụ thể trong DOM.
2.  **CSS**: Tìm các class `tm-price` hoặc `tb-rmb-num`.
3.  **Xử lý dữ liệu**: Dùng `.replace(/[^0-9.]/g, '')` để loại bỏ ký tự tiền tệ (¥), chỉ giữ lại số để tính toán.

### Bước 4: Lấy Hình Ảnh (Image)
- **Ảnh chính**: Tìm trong `#J_ImgBooth` (ID thường dùng của ảnh lớn Taobao).
- **Album ảnh**: Quét `#J_UlThumb img` để lấy danh sách các ảnh nhỏ (thumbnails).
- **Lọc trùng**: Kiểm tra xem ảnh đã có trong danh sách chưa trước khi thêm vào mảng `productData.images`.

### Bước 5: Lấy Thông Tin Khác
- **Người bán (Seller)**: Tìm tên shop trong header.
- **Phân loại (SKU)**: Tìm các nút bấm chọn màu/size (`.SkuItem` hoặc `.tb-sku li`) để lấy danh sách biến thể.
- **Phí ship**: Tìm thông tin vận chuyển và dùng Regex `match(/[\d.]+/` để trích xuất số tiền.

## 3. Lắng Nghe Sự Kiện (Message Listener)

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractProduct') {
        const productData = extractProductInfo();
        sendResponse({ success: true, data: productData });
    }
    return true;
});
```
- **Cơ chế**: Extension hoạt động theo mô hình Client-Server. Popup (giao diện) gửi tin nhắn `extractProduct` -> Content Script nhận được -> Chạy hàm `extractProductInfo()` -> Trả kết quả về cho Popup hiển thị.

## 4. Tự Động Trích Xuất (Auto Extract)

```javascript
chrome.storage.local.get(['autoExtract'], (result) => {
    if (result.autoExtract !== false) {
        // ... Tự động lấy dữ liệu khi trang vừa load xong
    }
});
```
- Nếu người dùng bật chế độ "Tự động lấy" trong Cài đặt, script sẽ chạy ngay khi trang web tải xong mà không cần bấm vào icon Extension. Dữ liệu được lưu vào `chrome.storage` để sẵn sàng sử dụng.
