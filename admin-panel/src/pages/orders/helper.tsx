export const formatVnd = (value: number) =>
  new Intl.NumberFormat("vi-VN").format(value) + "đ";
