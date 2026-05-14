import { useState } from "react";
import { useLogin } from "@refinedev/core";
import { Alert, Button, Card, Form, Input, Space, Typography } from "antd";
import { useLocation } from "react-router";

const { Title, Text } = Typography;

type LoginFormValues = {
  email: string;
  password: string;
};

type LoginParams = LoginFormValues & {
  redirect?: string;
};

export const LoginPage = () => {
  const location = useLocation();
  const { mutateAsync: login, isPending } = useLogin<LoginParams>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const redirect = new URLSearchParams(location.search).get("redirect") || undefined;

  const handleSubmit = async (values: LoginFormValues) => {
    setErrorMessage(null);

    const result = await login({
      ...values,
      redirect,
    });

    if (result?.success === false) {
      setErrorMessage(
        result.error instanceof Error ? result.error.message : "Đăng nhập thất bại.",
      );
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 52%, #eff6ff 100%)",
      }}
    >
      <Card
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 24,
          boxShadow: "0 24px 64px rgba(15, 23, 42, 0.12)",
        }}
      >
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <div>
            <Text style={{ color: "#ef4444", fontWeight: 700, letterSpacing: 1.2 }}>
              LOGISTICS SYSTEM
            </Text>
            <Title level={2} style={{ margin: "8px 0 0" }}>
              Đăng nhập
            </Title>
            <Text type="secondary">Sử dụng tài khoản hiện tại để tạo đơn hàng từ frontend.</Text>
          </div>

          {errorMessage ? <Alert type="error" showIcon message={errorMessage} /> : null}

          <Form<LoginFormValues> layout="vertical" onFinish={handleSubmit}>
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: "Vui lòng nhập email." },
                { type: "email", message: "Email không hợp lệ." },
              ]}
            >
              <Input placeholder="admin@example.com" autoComplete="username" />
            </Form.Item>

            <Form.Item
              label="Mật khẩu"
              name="password"
              rules={[{ required: true, message: "Vui lòng nhập mật khẩu." }]}
            >
              <Input.Password placeholder="Nhập mật khẩu" autoComplete="current-password" />
            </Form.Item>

            <Button type="primary" htmlType="submit" block size="large" loading={isPending}>
              Đăng nhập
            </Button>
          </Form>
        </Space>
      </Card>
    </div>
  );
};
