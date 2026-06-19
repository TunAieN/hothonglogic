import { useState } from "react";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import {
  Avatar,
  Breadcrumb,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from "antd";
import type { TableColumnsType } from "antd";
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  TeamOutlined,
  UnlockOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { Department, Employee, EmployeeRole, EmployeeStatus } from "../../types/employee";
import "./employees.css";

const DATE_FORMAT = "DD/MM/YYYY";
const DEFAULT_PAGE_SIZE = 5;

type EmployeeFormValues = {
  fullName: string;
  email: string;
  phone: string;
  department: Department;
  role: EmployeeRole;
  status: EmployeeStatus;
  temporaryPassword?: string;
  note?: string;
};

type FilterState = {
  search: string;
  department?: Department;
  role?: EmployeeRole;
  status?: EmployeeStatus;
  createdFrom: Dayjs | null;
  createdTo: Dayjs | null;
};

const departmentOptions: Array<{ label: string; value: Department }> = [
  { label: "Kinh doanh", value: "sales" },
  { label: "Chăm sóc KH", value: "customer_service" },
  { label: "Kho hàng TQ", value: "china_warehouse" },
  { label: "Kho hàng VN", value: "vietnam_warehouse" },
  { label: "Kế toán", value: "accounting" },
  { label: "Quản trị", value: "administration" },
];

const roleOptions: Array<{ label: string; value: EmployeeRole }> = [
  { label: "Quản trị viên", value: "admin" },
  { label: "Nhân viên", value: "staff" },
  { label: "Kế toán", value: "accountant" },
  { label: "CSKH", value: "customer_service" },
  { label: "Nhân viên kho", value: "warehouse_staff" },
];

const statusOptions: Array<{ label: string; value: EmployeeStatus }> = [
  { label: "Đang làm việc", value: "active" },
  { label: "Tạm khóa", value: "locked" },
  { label: "Nghỉ việc", value: "inactive" },
];

const departmentLabels = departmentOptions.reduce<Record<Department, string>>((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {} as Record<Department, string>);

const roleLabels = roleOptions.reduce<Record<EmployeeRole, string>>((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {} as Record<EmployeeRole, string>);

const statusLabels = statusOptions.reduce<Record<EmployeeStatus, string>>((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {} as Record<EmployeeStatus, string>);

const initialEmployees: Employee[] = [
  {
    id: "1",
    code: "NV001",
    fullName: "Nguyễn Văn An",
    email: "nguyenvanan@gmail.com",
    phone: "0987 654 321",
    department: "sales",
    role: "admin",
    status: "active",
    createdAt: "01/05/2024",
    avatar: "https://i.pravatar.cc/100?img=12",
  },
  {
    id: "2",
    code: "NV002",
    fullName: "Trần Thị Bình",
    email: "tranthibinh@gmail.com",
    phone: "0976 543 210",
    department: "customer_service",
    role: "staff",
    status: "active",
    createdAt: "05/05/2024",
    avatar: "https://i.pravatar.cc/100?img=32",
  },
  {
    id: "3",
    code: "NV003",
    fullName: "Lê Minh Cường",
    email: "leminhcuong@gmail.com",
    phone: "0965 432 109",
    department: "china_warehouse",
    role: "warehouse_staff",
    status: "active",
    createdAt: "10/05/2024",
    avatar: "https://i.pravatar.cc/100?img=15",
  },
  {
    id: "4",
    code: "NV004",
    fullName: "Phạm Thu Hà",
    email: "phamthuha@gmail.com",
    phone: "0932 111 222",
    department: "accounting",
    role: "accountant",
    status: "locked",
    createdAt: "12/05/2024",
    avatar: "https://i.pravatar.cc/100?img=24",
  },
  {
    id: "5",
    code: "NV005",
    fullName: "Hoàng Quốc Duy",
    email: "hoangquocduy@gmail.com",
    phone: "0944 333 444",
    department: "vietnam_warehouse",
    role: "warehouse_staff",
    status: "inactive",
    createdAt: "20/04/2024",
    avatar: "https://i.pravatar.cc/100?img=18",
  },
  {
    id: "6",
    code: "NV006",
    fullName: "Ngô Mỹ Linh",
    email: "ngomylinh@gmail.com",
    phone: "0911 222 678",
    department: "administration",
    role: "staff",
    status: "active",
    createdAt: "25/04/2024",
    avatar: "https://i.pravatar.cc/100?img=47",
  },
  {
    id: "7",
    code: "NV007",
    fullName: "Vũ Thanh Nam",
    email: "vuthanhnam@gmail.com",
    phone: "0935 888 116",
    department: "sales",
    role: "staff",
    status: "active",
    createdAt: "28/04/2024",
    avatar: "https://i.pravatar.cc/100?img=58",
  },
  {
    id: "8",
    code: "NV008",
    fullName: "Bùi Hồng Phúc",
    email: "buihongphuc@gmail.com",
    phone: "0979 234 567",
    department: "customer_service",
    role: "customer_service",
    status: "active",
    createdAt: "30/04/2024",
    avatar: "https://i.pravatar.cc/100?img=53",
  },
  {
    id: "9",
    code: "NV009",
    fullName: "Đặng Khánh Vy",
    email: "dangkhanhvy@gmail.com",
    phone: "0909 123 456",
    department: "accounting",
    role: "accountant",
    status: "active",
    createdAt: "02/05/2024",
    avatar: "https://i.pravatar.cc/100?img=5",
  },
  {
    id: "10",
    code: "NV010",
    fullName: "Trịnh Gia Huy",
    email: "trinhgiahuy@gmail.com",
    phone: "0968 456 789",
    department: "china_warehouse",
    role: "warehouse_staff",
    status: "locked",
    createdAt: "03/05/2024",
    avatar: "https://i.pravatar.cc/100?img=66",
  },
  {
    id: "11",
    code: "NV011",
    fullName: "Lý Thảo Nguyên",
    email: "lythaonguyen@gmail.com",
    phone: "0986 000 111",
    department: "vietnam_warehouse",
    role: "warehouse_staff",
    status: "active",
    createdAt: "08/05/2024",
    avatar: "https://i.pravatar.cc/100?img=9",
  },
  {
    id: "12",
    code: "NV012",
    fullName: "Phan Tuấn Kiệt",
    email: "phantuankiet@gmail.com",
    phone: "0922 555 666",
    department: "sales",
    role: "admin",
    status: "active",
    createdAt: "09/05/2024",
    avatar: "https://i.pravatar.cc/100?img=68",
  },
];

const emptyFilters: FilterState = {
  search: "",
  department: undefined,
  role: undefined,
  status: undefined,
  createdFrom: null,
  createdTo: null,
};

const getRoleTagColor = (role: EmployeeRole) => {
  switch (role) {
    case "admin":
      return { color: "#7c3aed", background: "#f3e8ff" };
    case "accountant":
      return { color: "#ea580c", background: "#ffedd5" };
    default:
      return { color: "#2563eb", background: "#eaf2ff" };
  }
};

const getStatusTagColor = (status: EmployeeStatus) => {
  switch (status) {
    case "active":
      return { color: "#16a34a", background: "#e8f8ee" };
    case "locked":
      return { color: "#f59e0b", background: "#fff4de" };
    default:
      return { color: "#64748b", background: "#eef2f7" };
  }
};

const getNextEmployeeCode = (employees: Employee[]) => {
  const maxCode = employees.reduce((max, employee) => {
    const number = Number(employee.code.replace("NV", ""));
    return Number.isNaN(number) ? max : Math.max(max, number);
  }, 0);

  return `NV${String(maxCode + 1).padStart(3, "0")}`;
};

export const EmployeesPage = () => {
  const [form] = Form.useForm<EmployeeFormValues>();
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const filteredEmployees = employees.filter((employee) => {
    const normalizedSearch = filters.search.trim().toLowerCase();
    const employeeDate = dayjs(employee.createdAt, DATE_FORMAT);

    const matchesSearch =
      normalizedSearch.length === 0 ||
      employee.fullName.toLowerCase().includes(normalizedSearch) ||
      employee.email.toLowerCase().includes(normalizedSearch) ||
      employee.phone.toLowerCase().includes(normalizedSearch) ||
      employee.code.toLowerCase().includes(normalizedSearch);

    const matchesDepartment = !filters.department || employee.department === filters.department;
    const matchesRole = !filters.role || employee.role === filters.role;
    const matchesStatus = !filters.status || employee.status === filters.status;
    const matchesFrom =
      !filters.createdFrom ||
      employeeDate.isSame(filters.createdFrom, "day") ||
      employeeDate.isAfter(filters.createdFrom, "day");
    const matchesTo =
      !filters.createdTo ||
      employeeDate.isSame(filters.createdTo, "day") ||
      employeeDate.isBefore(filters.createdTo, "day");

    return matchesSearch && matchesDepartment && matchesRole && matchesStatus && matchesFrom && matchesTo;
  });

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedEmployees = filteredEmployees.slice(startIndex, startIndex + pageSize);

  const statItems = [
    {
      key: "all",
      label: "Tổng nhân viên",
      value: employees.length,
      description: "Tất cả nhân viên",
      icon: <TeamOutlined />,
      iconStyle: { color: "#2563eb", background: "#eaf2ff" },
    },
    {
      key: "active",
      label: "Đang làm việc",
      value: employees.filter((employee) => employee.status === "active").length,
      description: "Nhân viên hoạt động",
      icon: <CheckCircleOutlined />,
      iconStyle: { color: "#16a34a", background: "#eaf8ef" },
    },
    {
      key: "locked",
      label: "Tạm khóa",
      value: employees.filter((employee) => employee.status === "locked").length,
      description: "Tạm khóa tài khoản",
      icon: <LockOutlined />,
      iconStyle: { color: "#f59e0b", background: "#fff4de" },
    },
    {
      key: "inactive",
      label: "Nghỉ việc",
      value: employees.filter((employee) => employee.status === "inactive").length,
      description: "Đã nghỉ việc",
      icon: <StopOutlined />,
      iconStyle: { color: "#64748b", background: "#eef2f7" },
    },
  ];

  const resetModal = () => {
    setEditingEmployee(null);
    setIsModalOpen(false);
    form.resetFields();
  };

  const openCreateModal = () => {
    setEditingEmployee(null);
    form.resetFields();
    form.setFieldsValue({ status: "active" });
    setIsModalOpen(true);
  };

  const openEditModal = (employee: Employee) => {
    setEditingEmployee(employee);
    form.setFieldsValue({
      fullName: employee.fullName,
      email: employee.email,
      phone: employee.phone,
      department: employee.department,
      role: employee.role,
      status: employee.status,
      temporaryPassword: employee.temporaryPassword,
      note: employee.note,
    });
    setIsModalOpen(true);
  };

  const handleResetFilters = () => {
    setFilters(emptyFilters);
    setCurrentPage(1);
  };

  const handleDelete = (employeeId: string) => {
    setEmployees((current) => current.filter((employee) => employee.id !== employeeId));
    message.success("Đã xóa nhân viên khỏi danh sách mock.");
  };

  const handleToggleLock = (employeeId: string) => {
    setEmployees((current) =>
      current.map((employee) =>
        employee.id === employeeId
          ? {
              ...employee,
              status: employee.status === "locked" ? "active" : "locked",
            }
          : employee,
      ),
    );
    message.success("Đã cập nhật trạng thái tài khoản.");
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();

    if (editingEmployee) {
      setEmployees((current) =>
        current.map((employee) =>
          employee.id === editingEmployee.id
            ? {
                ...employee,
                ...values,
              }
            : employee,
        ),
      );
      console.log("Update employee", editingEmployee.id, values);
      message.success("Đã cập nhật nhân viên.");
    } else {
      const newEmployee: Employee = {
        id: `${Date.now()}`,
        code: getNextEmployeeCode(employees),
        createdAt: dayjs().format(DATE_FORMAT),
        avatar: `https://i.pravatar.cc/100?u=${encodeURIComponent(values.email)}`,
        ...values,
      };

      setEmployees((current) => [newEmployee, ...current]);
      console.log("Create employee", newEmployee);
      message.success("Đã thêm nhân viên mới.");
    }

    resetModal();
  };

  const columns: TableColumnsType<Employee> = [
    {
      title: "Mã NV",
      dataIndex: "code",
      key: "code",
      width: 90,
    },
    {
      title: "Họ và tên",
      key: "fullName",
      width: 220,
      render: (_, employee) => (
        <div className="employees-page__name-cell">
          <Avatar src={employee.avatar} icon={<UserOutlined />} />
          <span className="employees-page__name-text">{employee.fullName}</span>
        </div>
      ),
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      width: 220,
    },
    {
      title: "Số điện thoại",
      dataIndex: "phone",
      key: "phone",
      width: 140,
    },
    {
      title: "Phòng ban",
      key: "department",
      width: 150,
      render: (_, employee) => departmentLabels[employee.department],
    },
    {
      title: "Vai trò",
      key: "role",
      width: 130,
      render: (_, employee) => {
        const colorStyle = getRoleTagColor(employee.role);
        return (
          <Tag className="employees-page__role-tag" style={colorStyle}>
            {roleLabels[employee.role]}
          </Tag>
        );
      },
    },
    {
      title: "Trạng thái",
      key: "status",
      width: 140,
      render: (_, employee) => {
        const colorStyle = getStatusTagColor(employee.status);
        return (
          <Tag className="employees-page__status-tag" style={colorStyle}>
            {statusLabels[employee.status]}
          </Tag>
        );
      },
    },
    {
      title: "Ngày tạo",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 120,
    },
    {
      title: "Thao tác",
      key: "actions",
      fixed: "right",
      width: 140,
      render: (_, employee) => {
        const isLocked = employee.status === "locked";

        return (
          <Space size={8}>
            <Tooltip title="Sửa nhân viên">
              <Button
                className="employees-page__action-button"
                icon={<EditOutlined />}
                onClick={() => openEditModal(employee)}
              />
            </Tooltip>

            <Popconfirm
              title={
                isLocked
                  ? "Bạn có chắc muốn mở khóa tài khoản nhân viên này?"
                  : "Bạn có chắc muốn khóa tài khoản nhân viên này?"
              }
              okText={isLocked ? "Mở khóa" : "Khóa"}
              cancelText="Hủy"
              onConfirm={() => handleToggleLock(employee.id)}
            >
              <Tooltip title={isLocked ? "Mở khóa tài khoản" : "Khóa tài khoản"}>
                <Button
                  className="employees-page__action-button"
                  icon={isLocked ? <UnlockOutlined /> : <LockOutlined />}
                />
              </Tooltip>
            </Popconfirm>

            <Popconfirm
              title="Bạn có chắc muốn xóa nhân viên này?"
              description="Thao tác này có thể ảnh hưởng đến lịch sử xử lý đơn hàng."
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDelete(employee.id)}
            >
              <Tooltip title="Xóa nhân viên">
                <Button danger className="employees-page__action-button" icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  const startItem = filteredEmployees.length === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, filteredEmployees.length);

  return (
    <div className="employees-page">
      <div className="employees-page__header">
        <div>
          <Typography.Title className="employees-page__title">Nhân viên</Typography.Title>
          <Breadcrumb
            className="employees-page__breadcrumb"
            items={[{ title: "Trang chủ" }, { title: "Nhân viên" }]}
          />
          <Typography.Text className="employees-page__subtitle">
            Quản lý thông tin nhân viên và phân quyền truy cập hệ thống.
          </Typography.Text>
        </div>

        <Button
          type="primary"
          icon={<PlusOutlined />}
          className="employees-page__primary-button"
          onClick={openCreateModal}
        >
          Thêm nhân viên
        </Button>
      </div>

      <Row gutter={[20, 20]} style={{ marginBottom: 20 }}>
        {statItems.map((item) => (
          <Col xs={24} sm={12} xl={6} key={item.key}>
            <Card className="employees-page__stat-card">
              <div className="employees-page__stat-icon" style={item.iconStyle}>
                {item.icon}
              </div>
              <div className="employees-page__stat-meta">
                <Typography.Text className="employees-page__stat-label">{item.label}</Typography.Text>
                <Typography.Title level={2} className="employees-page__stat-value">
                  {item.value}
                </Typography.Title>
                <Typography.Text className="employees-page__stat-description">
                  {item.description}
                </Typography.Text>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="employees-page__filter-card" style={{ marginBottom: 20 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12} xl={8}>
            <Typography.Text className="employees-page__field-label">Tìm kiếm</Typography.Text>
            <Input
              allowClear
              placeholder="Tìm theo tên, email, SĐT..."
              value={filters.search}
              className="employees-page__filter-input"
              suffix={<SearchOutlined style={{ color: "#94a3b8" }} />}
              onChange={(event) => {
                setCurrentPage(1);
                setFilters((current) => ({ ...current, search: event.target.value }));
              }}
            />
          </Col>

          <Col xs={24} sm={12} xl={5}>
            <Typography.Text className="employees-page__field-label">Phòng ban</Typography.Text>
            <Select
              allowClear
              placeholder="Tất cả phòng ban"
              value={filters.department}
              options={departmentOptions}
              className="employees-page__filter-select"
              onChange={(value) => {
                setCurrentPage(1);
                setFilters((current) => ({ ...current, department: value }));
              }}
            />
          </Col>

          <Col xs={24} sm={12} xl={5}>
            <Typography.Text className="employees-page__field-label">Vai trò</Typography.Text>
            <Select
              allowClear
              placeholder="Tất cả vai trò"
              value={filters.role}
              options={roleOptions}
              className="employees-page__filter-select"
              onChange={(value) => {
                setCurrentPage(1);
                setFilters((current) => ({ ...current, role: value }));
              }}
            />
          </Col>

          <Col xs={24} sm={12} xl={6}>
            <Typography.Text className="employees-page__field-label">Trạng thái</Typography.Text>
            <Select
              allowClear
              placeholder="Tất cả trạng thái"
              value={filters.status}
              options={statusOptions}
              className="employees-page__filter-select"
              onChange={(value) => {
                setCurrentPage(1);
                setFilters((current) => ({ ...current, status: value }));
              }}
            />
          </Col>

          <Col xs={24} sm={12} xl={5}>
            <Typography.Text className="employees-page__field-label">Ngày tạo từ</Typography.Text>
            <DatePicker
              placeholder="Chọn ngày"
              format={DATE_FORMAT}
              value={filters.createdFrom}
              className="employees-page__filter-date"
              style={{ width: "100%" }}
              onChange={(value) => {
                setCurrentPage(1);
                setFilters((current) => ({ ...current, createdFrom: value }));
              }}
            />
          </Col>

          <Col xs={24} sm={12} xl={5}>
            <Typography.Text className="employees-page__field-label">Đến ngày</Typography.Text>
            <DatePicker
              placeholder="Chọn ngày"
              format={DATE_FORMAT}
              value={filters.createdTo}
              className="employees-page__filter-date"
              style={{ width: "100%" }}
              onChange={(value) => {
                setCurrentPage(1);
                setFilters((current) => ({ ...current, createdTo: value }));
              }}
            />
          </Col>

          <Col xs={24} xl={14}>
            <div className="employees-page__filter-actions">
              <Button type="primary" icon={<SearchOutlined />} className="employees-page__search-button">
                Tìm kiếm
              </Button>
              <Button icon={<ReloadOutlined />} className="employees-page__reset-button" onClick={handleResetFilters}>
                Đặt lại
              </Button>
            </div>
          </Col>
        </Row>
      </Card>

      <Card className="employees-page__table-card">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={paginatedEmployees}
          pagination={false}
          scroll={{ x: 1200 }}
        />

        <div className="employees-page__footer">
          <span>
            Hiển thị {startItem} đến {endItem} trong tổng số {filteredEmployees.length} nhân viên
          </span>

          <Pagination
            current={safeCurrentPage}
            pageSize={pageSize}
            total={filteredEmployees.length}
            showSizeChanger
            pageSizeOptions={[5, 10, 20]}
            className="employees-page__pagination"
            onChange={(page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            }}
          />
        </div>
      </Card>

      <Modal
        open={isModalOpen}
        onCancel={resetModal}
        onOk={() => void handleSubmit()}
        okText={editingEmployee ? "Lưu thay đổi" : "Lưu nhân viên"}
        cancelText="Hủy"
        title={editingEmployee ? "Cập nhật nhân viên" : "Thêm nhân viên"}
        className="employees-page__modal"
      >
        <Form layout="vertical" form={form} initialValues={{ status: "active" }}>
          <Form.Item
            label="Họ và tên"
            name="fullName"
            rules={[{ required: true, message: "Vui lòng nhập họ và tên." }]}
          >
            <Input placeholder="Nhập họ và tên" />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: "Vui lòng nhập email." },
              { type: "email", message: "Email không hợp lệ." },
            ]}
          >
            <Input placeholder="Nhập email" />
          </Form.Item>

          <Form.Item
            label="Số điện thoại"
            name="phone"
            rules={[{ required: true, message: "Vui lòng nhập số điện thoại." }]}
          >
            <Input placeholder="Nhập số điện thoại" />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="Phòng ban"
                name="department"
                rules={[{ required: true, message: "Vui lòng chọn phòng ban." }]}
              >
                <Select placeholder="Chọn phòng ban" options={departmentOptions} />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                label="Vai trò"
                name="role"
                rules={[{ required: true, message: "Vui lòng chọn vai trò." }]}
              >
                <Select placeholder="Chọn vai trò" options={roleOptions} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="Trạng thái"
                name="status"
                rules={[{ required: true, message: "Vui lòng chọn trạng thái." }]}
              >
                <Select placeholder="Chọn trạng thái" options={statusOptions} />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item label="Mật khẩu tạm thời" name="temporaryPassword">
                <Input.Password placeholder="Nhập mật khẩu tạm" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Ghi chú" name="note">
            <Input.TextArea rows={4} placeholder="Thêm ghi chú nội bộ" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
