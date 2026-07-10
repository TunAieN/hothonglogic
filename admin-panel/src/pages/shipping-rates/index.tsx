import { useEffect, useState } from "react";
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { ColumnsType } from "antd/es/table";
import { deactivateShippingRate, fetchShippingRates, getShippingRateErrorMessage, saveShippingRate } from "./api";
import type { ShippingRate, ShippingRateDetail } from "./api";

const { Text, Title } = Typography;

const defaultDetails: ShippingRateDetail[] = [
  { min_weight: 0, max_weight: 0.5, price: 40000, price_type: "fixed", description: "Từ 0.5kg trở xuống", sort_order: 0 },
  { min_weight: 0.5, max_weight: 5, price: 70000, price_type: "per_kg", description: "Trên 0.5kg đến 5kg", sort_order: 1 },
  { min_weight: 5, max_weight: 30, price: 55000, price_type: "per_kg", description: "Từ 5kg đến 30kg", sort_order: 2 },
  { min_weight: 30, max_weight: null, price: 50000, price_type: "per_kg", description: "Từ 30kg trở lên", sort_order: 3 },
];

const validateDetails = (details: ShippingRateDetail[]) => {
  const ranges = details.map((item) => ({ min: Number(item.min_weight ?? 0), max: item.max_weight == null ? null : Number(item.max_weight), price: Number(item.price ?? 0) })).sort((a, b) => a.min - b.min);
  for (const item of ranges) {
    if (item.min < 0) return "Từ kg không được âm.";
    if (item.max !== null && item.max <= item.min) return "Đến kg phải lớn hơn Từ kg.";
    if (item.price <= 0) return "Đơn giá phải lớn hơn 0.";
  }
  for (let i = 1; i < ranges.length; i += 1) {
    if (ranges[i - 1].max === null || ranges[i].min < Number(ranges[i - 1].max)) return "Khung cân không được trùng hoặc chồng lấn.";
  }
  return null;
};

export const ShippingRatesPage = () => {
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ShippingRate | null>(null);
  const [details, setDetails] = useState<ShippingRateDetail[]>(defaultDetails);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      setRates(await fetchShippingRates());
    } catch (error) {
      message.error(getShippingRateErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const openCreate = () => {
    setEditing(null);
    setDetails(defaultDetails);
    form.setFieldsValue({ name: "Bảng cước dành cho khách lẻ", status: "active", effective_from: dayjs(), effective_to: null, customer_type: null, route_type: null, note: "" });
    setOpen(true);
  };

  const openEdit = (rate: ShippingRate) => {
    setEditing(rate);
    setDetails(rate.details?.length ? rate.details.map((item, index) => ({ ...item, sort_order: item.sort_order ?? index })) : defaultDetails);
    form.setFieldsValue({ ...rate, effective_from: rate.effective_from ? dayjs(rate.effective_from) : null, effective_to: rate.effective_to ? dayjs(rate.effective_to) : null });
    setOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const detailError = validateDetails(details);
    if (detailError) {
      message.error(detailError);
      return;
    }
    try {
      await saveShippingRate({
        name: values.name,
        customer_type: values.customer_type || null,
        route_type: values.route_type || null,
        warehouse_id: values.warehouse_id || null,
        effective_from: values.effective_from.format("YYYY-MM-DD"),
        effective_to: values.effective_to ? values.effective_to.format("YYYY-MM-DD") : null,
        status: values.status,
        note: values.note || null,
        details: details.map((item, index) => ({ ...item, sort_order: index })),
      }, editing?.id);
      message.success(editing ? "Cập nhật bảng giá thành công." : "Tạo bảng giá thành công.");
      setOpen(false);
      await loadData();
    } catch (error) {
      message.error(getShippingRateErrorMessage(error));
    }
  };

  const columns: ColumnsType<ShippingRate> = [
    { title: "Tên bảng giá", dataIndex: "name" },
    { title: "Đối tượng", render: (_, item) => item.customer_type ?? "Áp dụng chung", width: 150 },
    { title: "Tuyến/kho", render: (_, item) => item.route_type ?? item.warehouse_id ?? "Tất cả", width: 140 },
    { title: "Ngày bắt đầu", render: (_, item) => item.effective_from ? dayjs(item.effective_from).format("DD/MM/YYYY") : "-", width: 130 },
    { title: "Ngày kết thúc", render: (_, item) => item.effective_to ? dayjs(item.effective_to).format("DD/MM/YYYY") : "Về sau", width: 130 },
    { title: "Trạng thái", render: (_, item) => <Tag color={item.status === "active" ? "green" : "default"}>{item.status === "active" ? "Đang áp dụng" : "Ngừng áp dụng"}</Tag>, width: 140 },
    { title: "Số khung giá", render: (_, item) => item.details?.length ?? 0, width: 120 },
    { title: "Thao tác", render: (_, item) => <Space><Button type="link" onClick={() => openEdit(item)}>Sửa</Button>{item.status === "active" && <Popconfirm title="Ngừng áp dụng bảng giá này?" onConfirm={async () => { await deactivateShippingRate(item.id); await loadData(); }}><Button type="link" danger>Ngừng áp dụng</Button></Popconfirm>}</Space>, width: 190 },
  ];

  return <Space direction="vertical" size="large" style={{ width: "100%" }}>
    <Card>
      <Space style={{ width: "100%", justifyContent: "space-between" }} align="start">
        <div><Title level={2} style={{ margin: 0 }}>Quản lý bảng giá cước</Title><Text type="secondary">Thiết lập khung cân nặng, đơn giá và thời gian áp dụng cho phí vận chuyển.</Text></div>
        <Space><Button icon={<ReloadOutlined />} onClick={() => void loadData()}>Tải lại</Button><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Tạo bảng giá</Button></Space>
      </Space>
    </Card>
    <Card title="Danh sách bảng giá">
      <Table rowKey="id" loading={loading} columns={columns} dataSource={rates} pagination={{ pageSize: 10 }} />
    </Card>
    <Modal title={editing ? "Cập nhật bảng giá" : "Tạo bảng giá"} open={open} width={980} onCancel={() => setOpen(false)} onOk={() => void handleSave()} okText="Lưu bảng giá">
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="Tên bảng giá" rules={[{ required: true, message: "Vui lòng nhập tên bảng giá" }]}><Input /></Form.Item>
        <Space style={{ width: "100%" }} align="start">
          <Form.Item name="effective_from" label="Từ ngày" rules={[{ required: true, message: "Vui lòng chọn ngày bắt đầu" }]}><DatePicker format="DD/MM/YYYY" /></Form.Item>
          <Form.Item name="effective_to" label="Đến ngày"><DatePicker format="DD/MM/YYYY" placeholder="Về sau" /></Form.Item>
          <Form.Item name="status" label="Trạng thái"><Select style={{ width: 170 }} options={[{ value: "active", label: "Đang áp dụng" }, { value: "inactive", label: "Ngừng áp dụng" }]} /></Form.Item>
          <Form.Item name="customer_type" label="Loại khách hàng"><Input placeholder="retail/vip..." /></Form.Item>
          <Form.Item name="route_type" label="Tuyến"><Input placeholder="all/hn/hcm..." /></Form.Item>
        </Space>
        <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item>
      </Form>
      <Card size="small" title="Khung giá" extra={<Button onClick={() => setDetails((rows) => [...rows, { min_weight: 0, max_weight: null, price: 0, price_type: "per_kg", sort_order: rows.length }])}>Thêm khung giá</Button>}>
        <Table rowKey={(_, index) => String(index)} pagination={false} dataSource={details} columns={[
          { title: "Từ kg", render: (_, item, index) => <InputNumber min={0} value={item.min_weight} onChange={(value) => setDetails((rows) => rows.map((row, i) => i === index ? { ...row, min_weight: Number(value ?? 0) } : row))} /> },
          { title: "Đến kg", render: (_, item, index) => <InputNumber min={0} value={item.max_weight ?? undefined} placeholder="Về sau" onChange={(value) => setDetails((rows) => rows.map((row, i) => i === index ? { ...row, max_weight: value == null ? null : Number(value) } : row))} /> },
          { title: "Đơn giá", render: (_, item, index) => <InputNumber min={1} value={item.price} formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} onChange={(value) => setDetails((rows) => rows.map((row, i) => i === index ? { ...row, price: Number(value ?? 0) } : row))} /> },
          { title: "Kiểu tính giá", render: (_, item, index) => <Select value={item.price_type} style={{ width: 140 }} onChange={(value) => setDetails((rows) => rows.map((row, i) => i === index ? { ...row, price_type: value } : row))} options={[{ value: "fixed", label: "Giá cố định" }, { value: "per_kg", label: "Giá theo kg" }]} /> },
          { title: "Ghi chú", render: (_, item, index) => <Input value={item.description ?? ""} onChange={(event) => setDetails((rows) => rows.map((row, i) => i === index ? { ...row, description: event.target.value } : row))} /> },
          { title: "Thao tác", render: (_, __, index) => <Button danger onClick={() => setDetails((rows) => rows.filter((_, i) => i !== index))}>Xóa</Button> },
        ]} />
      </Card>
    </Modal>
  </Space>;
};
