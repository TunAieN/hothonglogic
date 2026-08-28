import { useCallback, useEffect, useMemo, useState } from "react";
import { useCreate, useDelete, useGetIdentity, useList, useUpdate } from "@refinedev/core";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { Link } from "react-router";
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
  EyeOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  TeamOutlined,
  UnlockOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { Department, EmployeeCreateInput, EmployeeGender, EmployeeRecord, EmployeeRole, EmployeeStatus, EmployeeUpdateInput } from "../../shared/types/employee";
import type { Role } from "../../shared/types/common";
import type { User } from "../../shared/types/common";
import { hasPermission } from "../../shared/auth/permissions";
import { client, getGraphqlAuthHeaders, syncGraphqlAuthToken } from "../../providers/graphqlClient";
import "./employees.css";

const DATE_FORMAT = "DD/MM/YYYY";
const API_DATE_FORMAT = "YYYY-MM-DD";
const DEFAULT_PAGE_SIZE = 5;

const EMPLOYEE_OPTIONS_QUERY = `
  query EmployeeOptions {
    roles {
      id
      key
      name
      description
      permissions
    }
    employees(first: 100, filter: { status: "active" }) {
      data {
        id
        name
        role { id key name description }
      }
    }
    employeeStatistics {
      total
      active
      locked
      inactive
    }
  }
`;

type EmployeeStatistics = {
  total: number;
  active: number;
  locked: number;
  inactive: number;
};

type EmployeeFormValues = {
  fullName: string;
  email: string;
  phone?: string;
  address?: string;
  birthday?: Dayjs | null;
  gender?: EmployeeGender;
  department: Department;
  role: string;
  joinedAt?: Dayjs | null;
  managerId?: string;
  status: EmployeeStatus;
  temporaryPassword?: string;
  note?: string;
};

type FilterState = {
  search: string;
  department?: Department;
  roleId?: string;
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
  { label: "Xuất hàng", value: "shipping" },
];

const departmentLabels = new Map(departmentOptions.map((option) => [option.value, option.label]));

const roleKeyByDepartment: Record<Department, EmployeeRole> = {
  administration: "admin",
  sales: "sales_staff",
  customer_service: "customer_service",
  china_warehouse: "china_warehouse_staff",
  vietnam_warehouse: "vietnam_warehouse_staff",
  accounting: "accountant",
  shipping: "shipping_staff",
};

const ROLE_DISPLAY_LABELS: Record<EmployeeRole, string> = {
  admin: "Quản trị viên",
  sales_staff: "Nhân viên kinh doanh",
  accountant: "Kế toán",
  customer_service: "CSKH",
  china_warehouse_staff: "Nhân viên kho Trung Quốc",
  vietnam_warehouse_staff: "Nhân viên kho Việt Nam",
  shipping_staff: "Nhân viên xuất hàng",
};

const ROLE_NAME_TRANSLATIONS: Record<string, string> = {
  admin: "Quản trị viên",
  administrator: "Quản trị viên",
  "customer service": "CSKH",
  accountant: "Kế toán",
  "delivery staff": "Nhân viên xuất hàng",
  "shipping staff": "Nhân viên xuất hàng",
  "warehouse staff": "Nhân viên kho Trung Quốc",
};

const statusOptions: Array<{ label: string; value: EmployeeStatus }> = [
  { label: "Đang làm việc", value: "active" },
  { label: "Tạm khóa", value: "locked" },
  { label: "Nghỉ việc", value: "inactive" },
];

const statusLabels = statusOptions.reduce<Record<EmployeeStatus, string>>((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {} as Record<EmployeeStatus, string>);

const emptyFilters: FilterState = {
  search: "",
  department: undefined,
  roleId: undefined,
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

const normalizeRoleName = (roleName?: string | null) => roleName?.trim().toLowerCase() ?? "";

const getRoleDisplayLabel = (roleName?: string | null) => {
  const normalizedRoleName = normalizeRoleName(roleName);

  return ROLE_NAME_TRANSLATIONS[normalizedRoleName] ?? roleName ?? "-";
};

const getRoleDepartmentWarning = (
  department: Department | undefined,
  roleId: string | number | undefined,
  roleById: Map<string, Role>,
) => {
  if (!department || !roleId) {
    return null;
  }

  const role = roleById.get(String(roleId));
  const roleKey = normalizeEmployeeRole(role?.key, role?.name);

  if (department === "accounting" && roleKey !== "accountant") {
    return "Phòng ban Kế toán thường nên đi với vai trò Kế toán.";
  }

  if (department === "china_warehouse" && roleKey !== "china_warehouse_staff") {
    return "Phòng ban Kho Trung Quốc thường nên đi với vai trò Nhân viên kho Trung Quốc.";
  }

  if (department === "vietnam_warehouse" && roleKey !== "vietnam_warehouse_staff") {
    return "Phòng ban Kho Việt Nam thường nên đi với vai trò Nhân viên kho Việt Nam.";
  }

  if (department === "customer_service" && roleKey !== "customer_service") {
    return "Phòng ban CSKH thường nên đi với vai trò CSKH.";
  }

  if (department === "administration" && roleKey !== "admin") {
    return "Phòng ban Quản trị thường nên đi với vai trò Quản trị viên.";
  }

  if (department === "sales" && roleKey !== "sales_staff") {
    return "Phòng ban Kinh doanh thường nên đi với vai trò Nhân viên kinh doanh.";
  }

  if (department === "shipping" && roleKey !== "shipping_staff") {
    return "Phòng ban Xuất hàng thường nên đi với vai trò Nhân viên xuất hàng.";
  }

  return null;
};


type EmployeeListRow = {
  id: string;
  code: string;
  fullName: string;
  email: string;
  phone: string;
  address?: string;
  birthday?: string;
  gender?: EmployeeGender;
  department?: Department;
  role: EmployeeRole;
  roleId?: string | number | null;
  roleName: string;
  status: EmployeeStatus;
  createdAt: string;
  joinedAt?: string;
  managerId?: string | number | null;
  note?: string;
  temporaryPassword?: string;
};

const normalizeEmployeeStatus = (status?: string | null): EmployeeStatus => {
  if (status === "inactive") {
    return "inactive";
  }

  if (status === "locked") {
    return "locked";
  }

  return "active";
};

const normalizeEmployeeRole = (roleKey?: string | null, roleName?: string | null): EmployeeRole => {
  if (roleKey) {
    return roleKey as EmployeeRole;
  }

  const normalizedRoleName = roleName?.trim().toLowerCase();

  switch (normalizedRoleName) {
    case "admin":
    case "administrator":
    case "quan tri vien":
      return "admin";
    case "accountant":
    case "ke toan":
      return "accountant";
    case "customer service":
    case "cskh":
    case "cham soc khach hang":
      return "customer_service";
    case "delivery staff":
    case "warehouse staff":
    case "nhan vien kho":
      return normalizedRoleName === "delivery staff" ? "shipping_staff" : "china_warehouse_staff";
    default:
      return "sales_staff";
  }
};

const mapEmployeeRecordToRow = (record: EmployeeRecord): EmployeeListRow => {
  const roleName = record.role?.name ?? "-";
  const createdAt = record.created_at ? dayjs(record.created_at).format(DATE_FORMAT) : "-";
  const numericId = Number(record.id);
  const code = Number.isFinite(numericId) ? `NV${String(numericId).padStart(3, "0")}` : `NV${record.id}`;

  return {
    id: record.id,
    code,
    fullName: record.name,
    email: record.email,
    phone: record.phone ?? "-",
    address: record.address ?? undefined,
    birthday: record.birthday ?? undefined,
    gender: record.gender ?? undefined,
    department: record.department ?? undefined,
    role: normalizeEmployeeRole(record.role?.key, roleName),
    roleId: record.role_id,
    roleName,
    status: normalizeEmployeeStatus(record.status),
    createdAt,
    joinedAt: record.joined_at ?? undefined,
    managerId: record.manager_id,
    note: record.note ?? undefined,
  };
};

const mapFormValuesToCreateInput = (values: EmployeeFormValues): EmployeeCreateInput => ({
  name: values.fullName.trim(),
  email: values.email.trim(),
  password: values.temporaryPassword?.trim() ?? "",
  role_id: String(values.role),
  phone: values.phone?.trim() || null,
  address: values.address?.trim() || null,
  birthday: values.birthday?.format(API_DATE_FORMAT) ?? null,
  gender: values.gender ?? null,
  note: values.note?.trim() || null,
  department: values.department,
  joined_at: values.joinedAt?.format(API_DATE_FORMAT) ?? null,
  manager_id: values.managerId || null,
  status: values.status,
});

const mapFormValuesToUpdateInput = (values: EmployeeFormValues): EmployeeUpdateInput => {
  const password = values.temporaryPassword?.trim();

  return {
    name: values.fullName.trim(),
    email: values.email.trim(),
    ...(password ? { password } : {}),
    role_id: String(values.role),
    phone: values.phone?.trim() || null,
    address: values.address?.trim() || null,
    birthday: values.birthday?.format(API_DATE_FORMAT) ?? null,
    gender: values.gender ?? null,
    note: values.note?.trim() || null,
    department: values.department,
    joined_at: values.joinedAt?.format(API_DATE_FORMAT) ?? null,
    manager_id: values.managerId || null,
    status: values.status,
  };
};

export const EmployeesPage = () => {
  const [form] = Form.useForm<EmployeeFormValues>();
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeListRow | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [managers, setManagers] = useState<EmployeeRecord[]>([]);
  const [statistics, setStatistics] = useState<EmployeeStatistics>({ total: 0, active: 0, locked: 0, inactive: 0 });
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [rolesLoadError, setRolesLoadError] = useState<string | null>(null);
  const { mutateAsync: createEmployee } = useCreate<EmployeeRecord>();
  const { mutateAsync: updateEmployee } = useUpdate<EmployeeRecord>();
  const { mutateAsync: deleteEmployee } = useDelete<EmployeeRecord>();
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);
  const { data: identity } = useGetIdentity<User>();
  const canCreate = hasPermission(identity, "employees.create");
  const canUpdate = hasPermission(identity, "employees.update");
  const canDelete = hasPermission(identity, "employees.delete");

  const loadEmployeeOptions = useCallback(async () => {
      setIsLoadingRoles(true);
      setRolesLoadError(null);

      try {
        syncGraphqlAuthToken();
        const response = await client.request<{
          roles: Role[];
          employees: { data: EmployeeRecord[] };
          employeeStatistics: EmployeeStatistics;
        }>(
          EMPLOYEE_OPTIONS_QUERY,
          {},
          getGraphqlAuthHeaders(),
        );

        setRoles(response.roles ?? []);
        setManagers(response.employees?.data ?? []);
        setStatistics(response.employeeStatistics);
      } catch (error) {
        console.error("Failed to load employee roles", error);
        setRoles([]);
        setManagers([]);
        setRolesLoadError("Không tải được danh sách vai trò nhân viên.");
        message.error("Không tải được danh sách vai trò nhân viên.");
      } finally {
        setIsLoadingRoles(false);
      }
  }, []);

  useEffect(() => {
    void loadEmployeeOptions();
  }, [loadEmployeeOptions]);

  const roleSelectOptions = useMemo(
    () => roles.map((role) => ({ label: getRoleDisplayLabel(role.name), value: String(role.id) })),
    [roles],
  );
  const roleById = useMemo(
    () => new Map(roles.map((role) => [String(role.id), role])),
    [roles],
  );
  const validRoleIds = useMemo(
    () => new Set(roles.map((role) => String(role.id))),
    [roles],
  );
  const hasRoleOptions = roleSelectOptions.length > 0;

  const apiFilters = useMemo(() => {
    const nextFilters = [];
    const search = filters.search.trim();

    if (search) {
      nextFilters.push({ field: "search", operator: "contains" as const, value: search });
    }

    if (filters.status) {
      nextFilters.push({ field: "status", operator: "eq" as const, value: filters.status });
    }

    if (filters.roleId) {
      nextFilters.push({ field: "role_id", operator: "eq" as const, value: filters.roleId });
    }

    if (filters.department) {
      nextFilters.push({ field: "department", operator: "eq" as const, value: filters.department });
    }

    if (filters.createdFrom) {
      nextFilters.push({
        field: "created_from",
        operator: "gte" as const,
        value: filters.createdFrom.startOf("day").format(API_DATE_FORMAT),
      });
    }

    if (filters.createdTo) {
      nextFilters.push({
        field: "created_to",
        operator: "lte" as const,
        value: filters.createdTo.endOf("day").format(API_DATE_FORMAT),
      });
    }

    return nextFilters;
  }, [filters.createdFrom, filters.createdTo, filters.department, filters.roleId, filters.search, filters.status]);

  const { result: employeesResult, query: employeesQuery } = useList<EmployeeRecord>({
    resource: "employees",
    pagination: { currentPage, pageSize },
    filters: apiFilters,
  });

  const employees = useMemo(
    () => (employeesResult.data ?? []).map(mapEmployeeRecordToRow),
    [employeesResult.data],
  );
  const totalEmployees = employeesResult.total ?? employees.length;

  const totalPages = Math.max(1, Math.ceil(totalEmployees / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedEmployees = employees;

  const statItems = [
    {
      key: "all",
      label: "Tổng nhân viên",
      value: statistics.total,
      description: "Tất cả nhân viên",
      icon: <TeamOutlined />,
      iconStyle: { color: "#2563eb", background: "#eaf2ff" },
    },
    {
      key: "active",
      label: "Đang làm việc",
      value: statistics.active,
      description: "Nhân viên hoạt động",
      icon: <CheckCircleOutlined />,
      iconStyle: { color: "#16a34a", background: "#eaf8ef" },
    },
    {
      key: "locked",
      label: "Tạm khóa",
      value: statistics.locked,
      description: "Tạm khóa tài khoản",
      icon: <LockOutlined />,
      iconStyle: { color: "#f59e0b", background: "#fff4de" },
    },
    {
      key: "inactive",
      label: "Nghỉ việc",
      value: statistics.inactive,
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

  const openEditModal = (employee: EmployeeListRow) => {
    setEditingEmployee(employee);
    form.setFieldsValue({
      fullName: employee.fullName,
      email: employee.email,
      phone: employee.phone === "-" ? undefined : employee.phone,
      address: employee.address,
      birthday: employee.birthday ? dayjs(employee.birthday) : null,
      gender: employee.gender,
      department: employee.department,
      role: employee.roleId ? String(employee.roleId) : employee.role,
      joinedAt: employee.joinedAt ? dayjs(employee.joinedAt) : null,
      managerId: employee.managerId ? String(employee.managerId) : undefined,
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

  const handleDelete = async (employeeId: string) => {
    setDeletingEmployeeId(employeeId);

    try {
      await deleteEmployee({
        resource: "employees",
        id: employeeId,
        successNotification: false,
        errorNotification: false,
      });

      message.success("Đã chuyển nhân viên sang trạng thái nghỉ việc.");
      await employeesQuery.refetch();
      await loadEmployeeOptions();
    } finally {
      setDeletingEmployeeId(null);
    }
  };

  const handleToggleLock = async (employee: EmployeeListRow) => {
    if (!employee.department || !employee.roleId) {
      message.error("Nhân viên chưa có đủ phòng ban hoặc vai trò. Hãy cập nhật hồ sơ trước khi khóa tài khoản.");
      return;
    }

    const nextStatus: EmployeeStatus = employee.status === "locked" ? "active" : "locked";

    await updateEmployee({
      resource: "employees",
      id: employee.id,
      values: {
        name: employee.fullName,
        email: employee.email,
        role_id: String(employee.roleId),
        phone: employee.phone === "-" ? null : employee.phone,
        address: employee.address ?? null,
        birthday: employee.birthday ?? null,
        gender: employee.gender ?? null,
        note: employee.note ?? null,
        department: employee.department,
        joined_at: employee.joinedAt ?? null,
        manager_id: employee.managerId ?? null,
        status: nextStatus,
      },
      successNotification: false,
      errorNotification: false,
    });

    message.success(nextStatus === "locked" ? "Đã khóa tài khoản nhân viên." : "Đã mở khóa tài khoản nhân viên.");
    await employeesQuery.refetch();
    await loadEmployeeOptions();
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();

    if (isLoadingRoles) {
      message.error("Danh sách vai trò đang tải, vui lòng thử lại.");
      return;
    }

    if (rolesLoadError || !hasRoleOptions) {
      message.error(rolesLoadError ?? "Chưa có vai trò nhân viên trong hệ thống.");
      return;
    }

    if (!validRoleIds.has(String(values.role))) {
      message.error("Vai trò đã chọn không hợp lệ, vui lòng chọn lại.");
      return;
    }

    setIsSavingEmployee(true);

    try {
      if (editingEmployee) {
        await updateEmployee({
          resource: "employees",
          id: editingEmployee.id,
          values: mapFormValuesToUpdateInput(values),
          successNotification: false,
          errorNotification: false,
        });

        message.success("Đã cập nhật nhân viên.");
      } else {
        await createEmployee({
          resource: "employees",
          values: mapFormValuesToCreateInput(values),
          successNotification: false,
          errorNotification: false,
        });

        message.success("Đã thêm nhân viên mới.");
      }

      resetModal();
      await employeesQuery.refetch();
      await loadEmployeeOptions();
    } finally {
      setIsSavingEmployee(false);
    }
  };

  const columns: TableColumnsType<EmployeeListRow> = [
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
          <Link to={`/employees/${employee.id}`} aria-label={`Xem chi tiết ${employee.fullName}`}>
            <Avatar icon={<UserOutlined />} />
          </Link>
          <Link className="employees-page__name-text" to={`/employees/${employee.id}`}>
            {employee.fullName}
          </Link>
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
      width: 190,
    },
    {
      title: "Phòng ban",
      key: "department",
      width: 150,
      render: (_, employee) => employee.department
        ? departmentLabels.get(employee.department) ?? employee.department
        : "-",
    },
    {
      title: "Vai trò",
      key: "role",
      width: 130,
      render: (_, employee) => {
        const colorStyle = getRoleTagColor(employee.role);
        return (
          <Tag className="employees-page__role-tag" style={colorStyle}>
            {getRoleDisplayLabel(employee.roleName) || ROLE_DISPLAY_LABELS[employee.role]}
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
            <Tooltip title="Xem chi tiết">
              <Link to={`/employees/${employee.id}`}>
                <Button className="employees-page__action-button" icon={<EyeOutlined />} />
              </Link>
            </Tooltip>
            {canUpdate && (
              <Tooltip title="Sửa nhân viên">
                <Button
                  className="employees-page__action-button"
                  icon={<EditOutlined />}
                  onClick={() => openEditModal(employee)}
                />
              </Tooltip>
            )}

            {canUpdate && <Popconfirm
              title={
                isLocked
                  ? "Bạn có chắc muốn mở khóa tài khoản nhân viên này?"
                  : "Bạn có chắc muốn khóa tài khoản nhân viên này?"
              }
              okText={isLocked ? "Mở khóa" : "Khóa"}
              cancelText="Hủy"
              onConfirm={() => void handleToggleLock(employee)}
            >
              <Tooltip title={isLocked ? "Mở khóa tài khoản" : "Khóa tài khoản"}>
                <Button
                  className="employees-page__action-button"
                  icon={isLocked ? <UnlockOutlined /> : <LockOutlined />}
                />
              </Tooltip>
            </Popconfirm>}

            {canDelete && <Popconfirm
              title="Bạn có chắc muốn xóa nhân viên này?"
              description="Thao tác này có thể ảnh hưởng đến lịch sử xử lý đơn hàng."
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
              onConfirm={() => void handleDelete(employee.id)}
            >
              <Tooltip title="Xóa nhân viên">
                <Button
                  danger
                  loading={deletingEmployeeId === employee.id}
                  className="employees-page__action-button"
                  icon={<DeleteOutlined />}
                />
              </Tooltip>
            </Popconfirm>}
          </Space>
        );
      },
    },
  ];

  const startItem = totalEmployees === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalEmployees);

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

        {canCreate && <Button
          type="primary"
          icon={<PlusOutlined />}
          className="employees-page__primary-button"
          onClick={openCreateModal}
        >
          Thêm nhân viên
        </Button>}
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
              value={filters.roleId}
              options={roleSelectOptions}
              loading={isLoadingRoles}
              notFoundContent={rolesLoadError ? "Không tải được vai trò" : "Không có vai trò"}
              className="employees-page__filter-select"
              onChange={(value) => {
                setCurrentPage(1);
                setFilters((current) => ({ ...current, roleId: value }));
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
          loading={employeesQuery.isLoading || employeesQuery.isFetching}
          pagination={false}
          scroll={{ x: 1200 }}
        />

        <div className="employees-page__footer">
          <span>
            Hiển thị {startItem} đến {endItem} trong tổng số {totalEmployees} nhân viên
          </span>

          <Pagination
            current={safeCurrentPage}
            pageSize={pageSize}
            total={totalEmployees}
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
        width={720}
        onCancel={resetModal}
        onOk={() => void handleSubmit()}
        confirmLoading={isSavingEmployee}
        okButtonProps={{ disabled: isLoadingRoles || Boolean(rolesLoadError) || !hasRoleOptions }}
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
          >
            <Input placeholder="Nhập số điện thoại" />
          </Form.Item>

          <Form.Item label="Địa chỉ" name="address">
            <Input placeholder="Nhập địa chỉ" />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Ngày sinh" name="birthday">
                <DatePicker format={DATE_FORMAT} style={{ width: "100%" }} placeholder="Chọn ngày sinh" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Giới tính" name="gender">
                <Select allowClear placeholder="Chọn giới tính" options={[
                  { label: "Nam", value: "male" },
                  { label: "Nữ", value: "female" },
                  { label: "Khác", value: "other" },
                ]} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="Phòng ban"
                name="department"
                rules={[{ required: true, message: "Vui lòng chọn phòng ban." }]}
              >
                <Select
                  placeholder="Chọn phòng ban"
                  options={departmentOptions}
                  onChange={(department: Department) => {
                    const suggestedRoleKey = roleKeyByDepartment[department];
                    const suggestedRole = roles.find((role) => role.key === suggestedRoleKey);

                    if (suggestedRole) {
                      form.setFieldValue("role", String(suggestedRole.id));
                    }
                  }}
                />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                label="Vai trò"
                name="role"
                rules={[
                  { required: true, message: "Vui lòng chọn vai trò." },
                  {
                    validator: (_, value) => {
                      if (!value || validRoleIds.has(String(value))) {
                        return Promise.resolve();
                      }

                      return Promise.reject(new Error("Vai trò đã chọn không tồn tại trong hệ thống."));
                    },
                  },
                ]}
              >
                <Select
                  placeholder="Chọn vai trò"
                  options={roleSelectOptions}
                  loading={isLoadingRoles}
                  disabled={isLoadingRoles || Boolean(rolesLoadError) || !hasRoleOptions}
                  notFoundContent={rolesLoadError ? "Không tải được vai trò" : "Không có vai trò"}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Ngày vào làm" name="joinedAt">
                <DatePicker format={DATE_FORMAT} style={{ width: "100%" }} placeholder="Chọn ngày vào làm" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Quản lý trực tiếp" name="managerId">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="Chọn quản lý"
                  options={managers
                    .filter((manager) => String(manager.id) !== String(editingEmployee?.id ?? ""))
                    .map((manager) => ({
                      value: String(manager.id),
                      label: `${manager.name}${manager.role?.name ? ` (${manager.role.name})` : ""}`,
                    }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item noStyle shouldUpdate={(previous, current) => previous.department !== current.department || previous.role !== current.role}>
            {({ getFieldValue }) => {
              const department = getFieldValue("department") as Department | undefined;
              const role = getFieldValue("role") as string | undefined;
              const warning = getRoleDepartmentWarning(department, role, roleById);

              return warning ? (
                <Typography.Text type="warning" className="employees-page__field-label">
                  {warning}
                </Typography.Text>
              ) : null;
            }}
          </Form.Item>

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
              <Form.Item
                label="Mật khẩu tạm thời"
                name="temporaryPassword"
                rules={[
                  {
                    validator: (_, value) => {
                      if (editingEmployee || String(value ?? "").trim().length >= 6) {
                        return Promise.resolve();
                      }

                      return Promise.reject(new Error("Vui lòng nhập mật khẩu tạm ít nhất 6 ký tự."));
                    },
                  },
                ]}
              >
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
