import { useState } from "react";
import { useLogin } from "@refinedev/core";
import {
  BarChartOutlined,
  DownOutlined,
  GlobalOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Alert, Button, Checkbox, Form, Input, Typography } from "antd";
import { useLocation } from "react-router";
import loginHero from "../../assets/login-logistics-hero.jpg";
import "./login-page.css";

const { Text, Title } = Typography;
const REMEMBERED_EMAIL_KEY = "login:remembered-email";

type LoginFormValues = {
  email: string;
  password: string;
  remember: boolean;
};

type LoginParams = Pick<LoginFormValues, "email" | "password"> & {
  redirect?: string;
};

const benefits = [
  {
    icon: <BarChartOutlined />,
    title: "Quản lý tập trung",
    description: "Theo dõi đơn hàng, kho bãi và vận chuyển trên một hệ thống.",
  },
  {
    icon: <SafetyCertificateOutlined />,
    title: "Bảo mật dữ liệu",
    description: "Phân quyền rõ ràng cho từng bộ phận và vai trò vận hành.",
  },
  {
    icon: <ThunderboltOutlined />,
    title: "Vận hành hiệu quả",
    description: "Tối ưu quy trình làm việc và hỗ trợ xử lý nghiệp vụ nhanh chóng.",
  },
];

const getRememberedEmail = () => localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "";

const GoogleLogo = () => (
  <svg className="login-provider-logo" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
    <path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.08 12c0-.67.12-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.55l3.35-2.62Z" />
    <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
  </svg>
);

const MicrosoftLogo = () => (
  <svg className="login-provider-logo" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
    <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
    <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
    <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
  </svg>
);

export const LoginPage = () => {
  const location = useLocation();
  const { mutateAsync: login, isPending } = useLogin<LoginParams>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const rememberedEmail = getRememberedEmail();
  const redirect = new URLSearchParams(location.search).get("redirect") || undefined;

  const handleSubmit = async ({ email, password, remember }: LoginFormValues) => {
    setErrorMessage(null);

    try {
      const result = await login({ email, password, redirect });

      if (result?.success === false) {
        setErrorMessage(
          result.error instanceof Error ? result.error.message : "Đăng nhập thất bại.",
        );
        return;
      }

      if (remember) {
        localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Đăng nhập thất bại.");
    }
  };

  return (
    <main className="login-page">
      <section className="login-shell" aria-label="Đăng nhập hệ thống LOGIC">
        <aside
          className="login-hero"
          style={{ backgroundImage: `url(${loginHero})` }}
          aria-label="Giải pháp quản lý logistics LOGIC"
        >
          <div className="login-hero__overlay" />
          <div className="login-hero__content">
            <div className="login-brand">
              <span className="login-brand__mark" aria-hidden="true">
                <span />
              </span>
              <span>
                <strong>LOGIC</strong>
                <small>Logistics Management</small>
              </span>
            </div>

            <div className="login-hero__message">
              <Title level={1}>Quản lý logistics hiệu quả và thông minh</Title>
              <Text>
                Giải pháp toàn diện giúp doanh nghiệp tối ưu quy trình vận hành, quản lý đơn
                hàng, kho bãi và vận chuyển.
              </Text>
            </div>

            <div className="login-benefits">
              {benefits.map((benefit) => (
                <div className="login-benefit" key={benefit.title}>
                  <span className="login-benefit__icon">{benefit.icon}</span>
                  <span>
                    <strong>{benefit.title}</strong>
                    <small>{benefit.description}</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="login-panel">
          <div className="login-locale" aria-label="Ngôn ngữ hiện tại">
            <GlobalOutlined />
            <span>Tiếng Việt</span>
            <DownOutlined className="login-locale__chevron" />
          </div>

          <div className="login-form-wrap">
            <header className="login-form-header">
              <Title level={2}>Đăng nhập hệ thống</Title>
              <Text>
                Chào mừng bạn quay trở lại! Vui lòng đăng nhập
                <br />
                để tiếp tục sử dụng hệ thống.
              </Text>
            </header>

            {errorMessage ? (
              <Alert
                className="login-alert"
                type="error"
                showIcon
                title={errorMessage}
                closable
                onClose={() => setErrorMessage(null)}
              />
            ) : null}

            <Form<LoginFormValues>
              className="login-form"
              layout="vertical"
              initialValues={{ email: rememberedEmail, remember: Boolean(rememberedEmail) }}
              onFinish={handleSubmit}
              requiredMark={false}
              size="large"
            >
              <Form.Item
                label="Email hoặc tên đăng nhập"
                name="email"
                rules={[
                  { required: true, message: "Vui lòng nhập email." },
                  { type: "email", message: "Email không hợp lệ." },
                ]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="Nhập email hoặc tên đăng nhập"
                  autoComplete="username"
                  autoFocus
                />
              </Form.Item>

              <div className="login-password-label">
                <span>Mật khẩu</span>
                <span>Quên mật khẩu?</span>
              </div>
              <Form.Item
                name="password"
                rules={[{ required: true, message: "Vui lòng nhập mật khẩu." }]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Nhập mật khẩu"
                  autoComplete="current-password"
                />
              </Form.Item>

              <Form.Item name="remember" valuePropName="checked" className="login-remember">
                <Checkbox>Ghi nhớ đăng nhập</Checkbox>
              </Form.Item>

              <Button
                className="login-submit"
                type="primary"
                htmlType="submit"
                block
                loading={isPending}
              >
                Đăng nhập
              </Button>
            </Form>

            <div className="login-divider" role="separator">
              <span>hoặc đăng nhập với</span>
            </div>

            <div className="login-providers" aria-label="Các phương thức đăng nhập khác">
              <button
                className="login-provider-button"
                type="button"
                disabled
                title="Đăng nhập Google chưa được hệ thống hỗ trợ"
              >
                <GoogleLogo />
                <span>Google</span>
              </button>
              <button
                className="login-provider-button"
                type="button"
                disabled
                title="Đăng nhập Microsoft chưa được hệ thống hỗ trợ"
              >
                <MicrosoftLogo />
                <span>Microsoft</span>
              </button>
            </div>

            <div className="login-support">
              Bạn chưa có tài khoản? <span>Liên hệ quản trị viên</span>
            </div>
          </div>

          <footer className="login-footer">
            © {new Date().getFullYear()} LOGIC Logistics Management. All rights reserved.
          </footer>
        </section>
      </section>
    </main>
  );
};
