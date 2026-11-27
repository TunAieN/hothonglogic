import type { PackageFormValues } from "./types";

const fields = {
  tracking_number: "trackingCode",
  warehouse_id: "warehouseId",
  warehouse_name: "warehouseId",
  warehouse_code: "warehouseId",
  receiver_user_id: "receiverUserId",
  weight: "weight",
  received_at: "receivedDate",
  note: "note",
} satisfies Record<string, keyof PackageFormValues>;

const safeMessages = [
  "Cấu hình dữ liệu người nhận kho Trung Quốc chưa hoàn tất. Vui lòng liên hệ quản trị viên.",
  "Vui lòng nhập mã vận đơn thực tế, không sử dụng mã đơn hàng.",
  "Mã vận đơn đã tồn tại trong kho Trung Quốc.",
  "Kho Trung Quốc không tồn tại hoặc đã ngừng hoạt động.",
  "Vui lòng chọn kho Trung Quốc đang hoạt động.",
  "Vui lòng chọn người nhận hàng hợp lệ.",
  "Nhân viên nhận hàng không còn hoạt động hoặc không có quyền tại kho Trung Quốc.",
  "Khối lượng thực tế phải lớn hơn 0.",
  "Vui lòng nhập thời gian nhận hàng.",
  "Thời gian nhận hàng không được ở tương lai.",
  "Vui lòng ghi chú thông tin bàn giao hoặc lý do cần đối chiếu.",
  "Tracking dự kiến đã thay đổi. Vui lòng mở lại danh sách dự kiến.",
  "Mã vận đơn có dữ liệu mâu thuẫn. Vui lòng đối chiếu trước khi tiếp nhận.",
  "Đây là mã đơn hàng VietTrung, không phải mã vận đơn.",
  "Mã vận đơn tối đa 100 ký tự.",
] as const;

export const DUPLICATE_CN_TRACKING = "Mã vận đơn đã tồn tại trong kho Trung Quốc.";

export type ReceivingFeedback = {
  message: string;
  field?: keyof PackageFormValues;
  checkExisting?: boolean;
};

type GraphqlFailure = {
  statusCode?: number;
  response?: {
    status?: number;
    errors?: Array<{ message?: string; extensions?: { field?: string; code?: string; status?: number; category?: string } }>;
  };
};

export const getReceivingError = (error: unknown, action: "create" | "update" | "tracking"): ReceivingFeedback => {
  const failure = error as GraphqlFailure | null;
  const gql = failure?.response?.errors?.[0];
  const { code, status, category, field: apiField } = gql?.extensions ?? {};
  const httpStatus = failure?.response?.status ?? failure?.statusCode;
  const rawMessage = gql?.message ?? (error instanceof Error ? error.message : "");
  const field = apiField && Object.hasOwn(fields, apiField) ? fields[apiField as keyof typeof fields] : undefined;

  if (httpStatus === 401 || status === 401 || code === "UNAUTHENTICATED" || rawMessage === "Unauthenticated.") {
    return { message: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại trước khi tiếp tục." };
  }
  if (httpStatus === 403 || status === 403 || code === "FORBIDDEN" || category === "authorization"
    || rawMessage === "Bạn không có quyền thực hiện thao tác này." || rawMessage === "This action is unauthorized.") {
    return { message: action === "create" ? "Bạn không có quyền nhập kiện tại kho Trung Quốc." : "Bạn không có quyền thực hiện thao tác này." };
  }
  if (code === "CN_PACKAGE_DUPLICATE_TRACKING" || rawMessage === DUPLICATE_CN_TRACKING) {
    return { message: DUPLICATE_CN_TRACKING, field: "trackingCode", checkExisting: action === "create" };
  }
  const safeMessage = safeMessages.find((message) => message === rawMessage);
  if (safeMessage) return { message: safeMessage, field };
  if (status === 422 || httpStatus === 422 || category === "validation" || code === "GRAPHQL_VALIDATION_FAILED"
    || /^Variable "\$\w+" got invalid value/.test(rawMessage)) {
    return { message: "Dữ liệu nhập kiện chưa hợp lệ. Vui lòng kiểm tra các trường trên form.", field };
  }
  if (action === "tracking") {
    return { message: "Không thể kiểm tra mã vận đơn do lỗi kết nối hoặc máy chủ. Vui lòng thử lại.", field: "trackingCode" };
  }
  if (action === "update") return { message: "Không thể cập nhật kiện hàng do lỗi kết nối hoặc máy chủ. Vui lòng thử lại." };
  return {
    message: "Chưa xác nhận được kết quả nhập kiện do lỗi kết nối hoặc máy chủ. Hãy kiểm tra mã vận đơn trước khi nhập lại.",
    checkExisting: true,
  };
};

export const getReceivingFormError = (error: unknown): ReceivingFeedback | undefined => {
  const result = error as { errorFields?: { name: [keyof PackageFormValues]; errors: string[] }[]; outOfDate?: boolean } | null;
  if (!Array.isArray(result?.errorFields)) return undefined;
  const first = result.errorFields[0];
  if (result.outOfDate) {
    return { message: "Thông tin vừa thay đổi. Vui lòng kiểm tra và bấm lưu lại.", field: first?.name[0] };
  }
  return {
    message: first?.errors[0] ? `Kiểm tra thông tin nhập kiện. ${first.errors[0]}` : "Kiểm tra thông tin nhập kiện.",
    field: first?.name[0],
  };
};
