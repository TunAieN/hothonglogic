export const customerAuthCapabilities = Object.freeze({
  login: false,
  rememberSession: false,
  passwordRecovery: false,
  registration: false,
  socialProviders: [],
});

export class CustomerAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CustomerAuthError";
    this.code = code;
  }
}

export async function loginCustomer() {
  throw new CustomerAuthError(
    "NOT_CONFIGURED",
    "Đăng nhập khách hàng chưa được kết nối với API xác thực.",
  );
}

export async function registerCustomer() {
  throw new CustomerAuthError(
    "REGISTRATION_NOT_CONFIGURED",
    "Chức năng đăng ký trực tuyến đang được hoàn thiện.",
  );
}
