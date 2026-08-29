import { Button, Result } from "antd";
import { useNavigate } from "react-router";

export const ForbiddenPage = () => {
  const navigate = useNavigate();

  return (
    <Result
      status="403"
      title="403"
      subTitle="Bạn không có quyền truy cập chức năng này."
      extra={
        <Button type="primary" onClick={() => navigate("/")}>
          Về trang tổng quan
        </Button>
      }
    />
  );
};
