import { useMemo, useState } from "react";
import { Alert, Button, DatePicker, Form, InputNumber, Modal, Popconfirm, Space, Table, Tag, Typography, message } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import type { ColumnsType } from "antd/es/table";
import {
  activateExchangeRate,
  createExchangeRate,
  deactivateExchangeRate,
  fetchExchangeRates,
  type ExchangeRate,
} from "./api";
import { formatExchangeRate } from "../../utils/currency";

const { Title, Text } = Typography;

type FormValues = {
  rate: number;
  effective_from?: dayjs.Dayjs | null;
  effective_to?: dayjs.Dayjs | null;
};

export const ExchangeRatesPage = () => {
  const [form] = Form.useForm<FormValues>();
  const [open, setOpen] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const queryClient = useQueryClient();

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["exchange-rates"],
    queryFn: fetchExchangeRates,
  });

  const createMutation = useMutation({
    mutationFn: createExchangeRate,
    onSuccess: async () => {
      messageApi.success("Đã tạo tỷ giá mới");
      setOpen(false);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
    },
    onError: (error) => messageApi.error(error instanceof Error ? error.message : "Không tạo được tỷ giá"),
  });

  const activateMutation = useMutation({
    mutationFn: activateExchangeRate,
    onSuccess: async () => {
      messageApi.success("Đã kích hoạt tỷ giá");
      await queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
    },
    onError: (error) => messageApi.error(error instanceof Error ? error.message : "Không kích hoạt được tỷ giá"),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateExchangeRate,
    onSuccess: async () => {
      messageApi.success("Đã ngừng tỷ giá");
      await queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
    },
    onError: (error) => messageApi.error(error instanceof Error ? error.message : "Không ngừng được tỷ giá"),
  });

  const activeRate = useMemo(() => data.find((item) => item.is_active), [data]);

  const columns: ColumnsType<ExchangeRate> = [
    { title: "Từ tiền tệ", dataIndex: "from_currency", width: 120 },
    { title: "Đến tiền tệ", dataIndex: "to_currency", width: 120 },
    { title: "Tỷ giá", dataIndex: "rate", render: (value) => <Text strong>{formatExchangeRate(value)}</Text> },
    {
      title: "Hiệu lực từ",
      dataIndex: "effective_from",
      render: (value) => (value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "-"),
    },
    {
      title: "Hiệu lực đến",
      dataIndex: "effective_to",
      render: (value) => (value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "-"),
    },
    {
      title: "Trạng thái",
      dataIndex: "is_active",
      render: (value) => <Tag color={value ? "green" : "default"}>{value ? "Đang áp dụng" : "Ngừng"}</Tag>,
    },
    { title: "Người cập nhật", render: (_, record) => record.creator?.name ?? "-" },
    {
      title: "Thao tác",
      key: "actions",
      align: "right",
      render: (_, record) => (
        <Space>
          {!record.is_active && (
            <Popconfirm
              title="Kích hoạt tỷ giá này?"
              description="Tỷ giá active hiện tại sẽ bị ngừng. Các đơn đã chốt trước đó vẫn giữ snapshot cũ."
              okText="Kích hoạt"
              cancelText="Hủy"
              onConfirm={() => activateMutation.mutate(record.id)}
            >
              <Button icon={<CheckCircleOutlined />}>Kích hoạt</Button>
            </Popconfirm>
          )}
          {record.is_active && (
            <Popconfirm
              title="Ngừng tỷ giá active?"
              description="Sau khi ngừng, đơn mới sẽ không thể chốt tỷ giá cho đến khi có tỷ giá active khác."
              okText="Ngừng"
              cancelText="Hủy"
              onConfirm={() => deactivateMutation.mutate(record.id)}
            >
              <Button icon={<CloseCircleOutlined />}>Ngừng</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const handleSubmit = async () => {
    const values = await form.validateFields();
    createMutation.mutate({
      from_currency: "CNY",
      to_currency: "VND",
      rate: values.rate,
      effective_from: values.effective_from?.toISOString() ?? null,
      effective_to: values.effective_to?.toISOString() ?? null,
      is_active: true,
    });
  };

  return (
    <div style={{ padding: 24 }}>
      {contextHolder}
      <Space direction="vertical" size={20} style={{ width: "100%" }}>
        <Space align="center" style={{ justifyContent: "space-between", width: "100%" }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>Quản lý tỷ giá</Title>
            <Text type="secondary">Tỷ giá CNY/VND được chốt vào đơn khi đơn chuyển sang đặt hàng.</Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>Tải lại</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Tạo tỷ giá mới</Button>
          </Space>
        </Space>

        <Alert
          type="warning"
          showIcon
          message="Thay đổi tỷ giá active chỉ áp dụng cho các đơn chưa chốt tỷ giá. Đơn đã chốt không tự đổi theo tỷ giá mới."
        />

        <div style={{ border: "1px solid #f0f0f0", borderRadius: 8, padding: 16, background: "#fff" }}>
          <Text type="secondary">Tỷ giá đang áp dụng</Text>
          <Title level={4} style={{ margin: "4px 0 0" }}>
            {activeRate ? formatExchangeRate(activeRate.rate) : "Chưa có tỷ giá active"}
          </Title>
        </div>

        <Table rowKey="id" loading={isLoading} columns={columns} dataSource={data} pagination={{ pageSize: 10 }} />
      </Space>

      <Modal title="Tạo tỷ giá mới" open={open} onCancel={() => setOpen(false)} onOk={handleSubmit} confirmLoading={createMutation.isPending} okText="Tạo và kích hoạt" cancelText="Hủy">
        <Form form={form} layout="vertical" initialValues={{ rate: 3600, effective_from: dayjs() }}>
          <Alert type="info" showIcon message="Tạo tỷ giá active mới sẽ ngừng tỷ giá active hiện tại. Lịch sử tỷ giá cũ vẫn được giữ." style={{ marginBottom: 16 }} />
          <Form.Item label="1 CNY bằng bao nhiêu VND" name="rate" rules={[{ required: true, message: "Nhập tỷ giá" }, { type: "number", min: 0.0001, message: "Tỷ giá phải lớn hơn 0" }]}>
            <InputNumber style={{ width: "100%" }} min={0} precision={4} controls={false} />
          </Form.Item>
          <Form.Item label="Hiệu lực từ" name="effective_from">
            <DatePicker showTime style={{ width: "100%" }} format="DD/MM/YYYY HH:mm" />
          </Form.Item>
          <Form.Item label="Hiệu lực đến" name="effective_to">
            <DatePicker showTime style={{ width: "100%" }} format="DD/MM/YYYY HH:mm" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
