import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useGetIdentity, useOne, useUpdate } from "@refinedev/core";
import dayjs, { type Dayjs } from "dayjs";
import {
  ApartmentOutlined,
  ArrowLeftOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  HistoryOutlined,
  IdcardOutlined,
  LockOutlined,
  MailOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  UnlockOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Avatar,
  Breadcrumb,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Skeleton,
  Space,
  Tabs,
  Tag,
  Timeline,
  Typography,
  message,
} from "antd";
import { Link, useNavigate, useParams } from "react-router";

import { EMPLOYEE_DETAIL_SUPPORT_QUERY } from "../../graphql/employees";
import { getPermissionLabel, groupPermissions } from "../../shared/auth/permissionLabels";
import { hasPermission } from "../../shared/auth/permissions";
import type { Role, User } from "../../shared/types/common";
import type {
  Department,
  EmployeeActivity,
  EmployeeGender,
  EmployeeRecord,
  EmployeeStatisticItem,
  EmployeeStatus,
  EmployeeUpdateInput,
} from "../../shared/types/employee";
import { client, getGraphqlAuthHeaders, syncGraphqlAuthToken } from "../../providers/graphqlClient";
import {
  DEPARTMENT_LABELS,
  GENDER_LABELS,
  STATUS_LABELS,
  getEmployeeCode,
  getEmployeeInitials,
} from "./employeePresentation";
import "./employee-show.css";

const DATE_FORMAT = "DD/MM/YYYY";
const API_DATE_FORMAT = "YYYY-MM-DD";
const EMPTY_VALUE = "-";

type EmployeeEditValues = {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  birthday?: Dayjs | null;
  gender?: EmployeeGender;
  note?: string;
  department: Department;
  role_id: string;
  joined_at?: Dayjs | null;
  manager_id?: string;
  status: EmployeeStatus;
  password?: string;
};

type DetailSupportResponse = {
  employeeDetailStatistics: EmployeeStatisticItem[];
  employeeActivity: EmployeeActivity[];
  roles: Role[];
  employees: { data: EmployeeRecord[] };
};

const departmentOptions = Object.entries(DEPARTMENT_LABELS).map(([value, label]) => ({ value, label }));
const statusOptions = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));
const genderOptions = Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label }));

const normalizeStatus = (status?: string | null): EmployeeStatus => {
  if (status === "locked" || status === "inactive") return status;
  return "active";
};

const formatDate = (value?: string | null, withTime = false): string => {
  if (!value || !dayjs(value).isValid()) return EMPTY_VALUE;
  return dayjs(value).format(withTime ? "DD/MM/YYYY HH:mm" : DATE_FORMAT);
};

const DetailRow = ({ icon, label, value }: { icon?: ReactNode; label: string; value: ReactNode }) => (
  <div className="employee-show__detail-row">
    <span className="employee-show__detail-label">{icon}{label}</span>
    <span className="employee-show__detail-value">{value || EMPTY_VALUE}</span>
  </div>
);

const statusClassName = (status: EmployeeStatus) => `employee-show__status employee-show__status--${status}`;

const activityText = (activity: EmployeeActivity): string => {
  const actions: Record<string, string> = {
    created: "Tạo",
    create: "Tạo",
    updated: "Cập nhật",
    update: "Cập nhật",
    deleted: "Xóa",
    delete: "Xóa",
    confirmed: "Xác nhận",
    completed: "Hoàn thành",
    login: "Đăng nhập hệ thống",
  };
  const action = actions[activity.action.toLowerCase()] ?? activity.action;
  if (activity.action.toLowerCase() === "login") return action;
  return `${action} ${activity.entity_type}${activity.entity_id ? ` #${activity.entity_id}` : ""}`;
};

export const EmployeeShowPage = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm<EmployeeEditValues>();
  const { data: identity } = useGetIdentity<User>();
  const { query } = useOne<EmployeeRecord>({
    resource: "employees",
    id,
    queryOptions: { enabled: Boolean(id) },
  });
  const { mutateAsync: updateEmployee } = useUpdate<EmployeeRecord>();
  const [statistics, setStatistics] = useState<EmployeeStatisticItem[]>([]);
  const [activities, setActivities] = useState<EmployeeActivity[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [managers, setManagers] = useState<EmployeeRecord[]>([]);
  const [supportLoading, setSupportLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  const employee = query.data?.data;
  const status = normalizeStatus(employee?.status);
  const canUpdate = hasPermission(identity, "employees.update");

  const loadSupport = useCallback(async () => {
    if (!id) return;
    setSupportLoading(true);
    try {
      syncGraphqlAuthToken();
      const response = await client.request<DetailSupportResponse>(
        EMPLOYEE_DETAIL_SUPPORT_QUERY,
        { employeeId: id },
        getGraphqlAuthHeaders(),
      );
      setStatistics(response.employeeDetailStatistics ?? []);
      setActivities(response.employeeActivity ?? []);
      setRoles(response.roles ?? []);
      setManagers((response.employees?.data ?? []).filter((item) => String(item.id) !== String(id)));
    } catch (error) {
      console.error("Failed to load employee detail support data", error);
      message.error("Không tải được dữ liệu bổ sung của nhân viên.");
    } finally {
      setSupportLoading(false);
    }
  }, [id]);

  useEffect(() => { void loadSupport(); }, [loadSupport]);

  const openEdit = () => {
    if (!employee) return;
    form.setFieldsValue({
      name: employee.name,
      email: employee.email,
      phone: employee.phone ?? undefined,
      address: employee.address ?? undefined,
      birthday: employee.birthday ? dayjs(employee.birthday) : null,
      gender: employee.gender ?? undefined,
      note: employee.note ?? undefined,
      department: employee.department ?? "sales",
      role_id: String(employee.role_id ?? ""),
      joined_at: employee.joined_at ? dayjs(employee.joined_at) : null,
      manager_id: employee.manager_id ? String(employee.manager_id) : undefined,
      status,
      password: undefined,
    });
    setEditOpen(true);
  };

  const buildUpdateInput = (values: EmployeeEditValues): EmployeeUpdateInput => ({
    name: values.name.trim(),
    email: values.email.trim(),
    ...(values.password?.trim() ? { password: values.password.trim() } : {}),
    role_id: values.role_id,
    phone: values.phone?.trim() || null,
    address: values.address?.trim() || null,
    birthday: values.birthday?.format(API_DATE_FORMAT) ?? null,
    gender: values.gender ?? null,
    note: values.note?.trim() || null,
    department: values.department,
    joined_at: values.joined_at?.format(API_DATE_FORMAT) ?? null,
    manager_id: values.manager_id || null,
    status: values.status,
  });

  const saveEdit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await updateEmployee({ resource: "employees", id, values: buildUpdateInput(values), successNotification: false, errorNotification: false });
      message.success("Đã cập nhật hồ sơ nhân viên.");
      setEditOpen(false);
      await Promise.all([query.refetch(), loadSupport()]);
    } catch (error) {
      console.error("Failed to update employee", error);
      message.error("Không thể cập nhật hồ sơ nhân viên.");
    } finally {
      setSaving(false);
    }
  };

  const toggleLock = async () => {
    if (!employee?.role_id || !employee.department) {
      message.error("Hồ sơ chưa có đủ vai trò hoặc phòng ban.");
      return;
    }
    setChangingStatus(true);
    try {
      await updateEmployee({
        resource: "employees",
        id,
        values: {
          name: employee.name,
          email: employee.email,
          role_id: employee.role_id,
          phone: employee.phone ?? null,
          address: employee.address ?? null,
          birthday: employee.birthday ?? null,
          gender: employee.gender ?? null,
          note: employee.note ?? null,
          department: employee.department,
          joined_at: employee.joined_at ?? null,
          manager_id: employee.manager_id ?? null,
          status: status === "locked" ? "active" : "locked",
        },
        successNotification: false,
        errorNotification: false,
      });
      message.success(status === "locked" ? "Đã mở khóa tài khoản." : "Đã tạm khóa tài khoản.");
      await query.refetch();
    } catch (error) {
      console.error("Failed to change employee status", error);
      message.error("Không thể thay đổi trạng thái tài khoản.");
    } finally {
      setChangingStatus(false);
    }
  };

  const permissionGroups = useMemo(
    () => groupPermissions(employee?.role?.permissions ?? []),
    [employee?.role?.permissions],
  );

  if (query.isLoading) {
    return <Card className="employee-show__loading"><Skeleton active avatar paragraph={{ rows: 8 }} /></Card>;
  }

  if (!employee || query.isError) {
    return (
      <Card className="employee-show__not-found">
        <Empty description="Không tìm thấy nhân viên.">
          <Button type="primary" onClick={() => navigate("/employees")}>Quay lại danh sách nhân viên</Button>
        </Empty>
      </Card>
    );
  }

  const departmentLabel = employee.department ? DEPARTMENT_LABELS[employee.department] : EMPTY_VALUE;
  const managerLabel = employee.manager
    ? `${employee.manager.name}${employee.manager.role?.name ? ` (${employee.manager.role.name})` : ""}`
    : EMPTY_VALUE;

  const generalTab = (
    <div className="employee-show__general-grid">
      <Card title="Thông tin cá nhân" className="employee-show__section-card">
        <DetailRow label="Họ và tên" value={employee.name} />
        <DetailRow label="Email" value={employee.email} />
        <DetailRow label="Số điện thoại" value={employee.phone ?? EMPTY_VALUE} />
        <DetailRow label="Ngày sinh" value={formatDate(employee.birthday)} />
        <DetailRow label="Giới tính" value={employee.gender ? GENDER_LABELS[employee.gender] : EMPTY_VALUE} />
        <DetailRow label="Địa chỉ" value={employee.address ?? EMPTY_VALUE} />
        <DetailRow label="Ghi chú" value={employee.note ?? EMPTY_VALUE} />
      </Card>

      <Card title="Thông tin công việc" className="employee-show__section-card">
        <DetailRow label="Phòng ban" value={departmentLabel} />
        <DetailRow label="Vai trò" value={employee.role?.name ?? EMPTY_VALUE} />
        <DetailRow label="Mã nhân viên" value={getEmployeeCode(employee.id)} />
        <DetailRow label="Ngày vào làm" value={formatDate(employee.joined_at)} />
        <DetailRow label="Quản lý trực tiếp" value={managerLabel} />
        <DetailRow label="Trạng thái" value={<Tag className={statusClassName(status)}>{STATUS_LABELS[status]}</Tag>} />
      </Card>

      <Card title="Vai trò & Quyền" className="employee-show__section-card employee-show__role-summary">
        <DetailRow label="Vai trò hiện tại" value={<Tag color="blue">{employee.role?.name ?? EMPTY_VALUE}</Tag>} />
        <div className="employee-show__description">
          <Typography.Text type="secondary">Mô tả vai trò</Typography.Text>
          <Typography.Paragraph>{employee.role?.description ?? EMPTY_VALUE}</Typography.Paragraph>
        </div>
      </Card>

      <Card title="Thống kê hoạt động" className="employee-show__section-card employee-show__statistics" loading={supportLoading}>
        {statistics.length > 0 ? (
          <Row gutter={[0, 16]}>
            {statistics.map((statistic) => (
              <Col xs={12} md={6} key={statistic.key} className="employee-show__statistic">
                <Typography.Text>{statistic.label}</Typography.Text>
                <Typography.Title level={3}>{statistic.value}</Typography.Title>
                <Typography.Text type="secondary">{statistic.suffix ?? ""}</Typography.Text>
              </Col>
            ))}
          </Row>
        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có số liệu hoạt động." />}
      </Card>
    </div>
  );

  const permissionsTab = (
    <Row gutter={[20, 20]}>
      <Col xs={24} lg={8}>
        <Card title="Thông tin vai trò" className="employee-show__section-card">
          <DetailRow label="Vai trò" value={employee.role?.name ?? EMPTY_VALUE} />
          <DetailRow label="Phòng ban" value={departmentLabel} />
          <Typography.Paragraph className="employee-show__role-description">{employee.role?.description ?? EMPTY_VALUE}</Typography.Paragraph>
        </Card>
      </Col>
      <Col xs={24} lg={16}>
        <Card title="Danh sách quyền" className="employee-show__section-card">
          {permissionGroups.length > 0 ? permissionGroups.map((group) => (
            <div className="employee-show__permission-group" key={group.key}>
              <Typography.Text strong>{group.label}</Typography.Text>
              <div className="employee-show__permission-list">
                {group.permissions.map((permission) => (
                  <span key={permission}><CheckCircleOutlined /> {getPermissionLabel(permission)}</span>
                ))}
              </div>
            </div>
          )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Vai trò chưa có quyền được cấu hình." />}
        </Card>
      </Col>
    </Row>
  );

  const activityTab = (
    <Card className="employee-show__section-card" loading={supportLoading}>
      {activities.length > 0 ? (
        <Timeline items={activities.map((activity) => ({
          color: "blue",
          children: <><Typography.Text strong>{formatDate(activity.created_at, true)}</Typography.Text><div>{activityText(activity)}</div></>,
        }))} />
      ) : <Empty description="Chưa có lịch sử hoạt động." />}
    </Card>
  );

  return (
    <div className="employee-show">
      <Breadcrumb className="employee-show__breadcrumb" items={[
        { title: "Nhân sự" },
        { title: <Link to="/employees">Danh sách nhân viên</Link> },
        { title: "Chi tiết nhân viên" },
      ]} />

      <div className="employee-show__header">
        <Typography.Title level={2}>Chi tiết nhân viên</Typography.Title>
        <Space wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/employees")}>Quay lại</Button>
          {canUpdate && <Button type="primary" icon={<EditOutlined />} onClick={openEdit}>Chỉnh sửa</Button>}
          {canUpdate && status !== "inactive" && (
            <Popconfirm
              title={status === "locked" ? "Mở khóa tài khoản nhân viên?" : "Tạm khóa tài khoản nhân viên?"}
              okText={status === "locked" ? "Mở khóa" : "Tạm khóa"}
              cancelText="Hủy"
              onConfirm={() => void toggleLock()}
            >
              <Button danger={status !== "locked"} loading={changingStatus} icon={status === "locked" ? <UnlockOutlined /> : <LockOutlined />}>
                {status === "locked" ? "Mở khóa" : "Tạm khóa"}
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      <Card className="employee-show__profile-card">
        <div className="employee-show__profile-main">
          <Avatar size={92} className="employee-show__avatar">{getEmployeeInitials(employee.name)}</Avatar>
          <div className="employee-show__identity">
            <div className="employee-show__name-line">
              <Typography.Title level={3}>{employee.name}</Typography.Title>
              <Tag className={statusClassName(status)}>{STATUS_LABELS[status]}</Tag>
            </div>
            <Typography.Text className="employee-show__code"><IdcardOutlined /> {getEmployeeCode(employee.id)}</Typography.Text>
            <Space wrap className="employee-show__tags">
              <Tag color="blue"><SafetyCertificateOutlined /> {employee.role?.name ?? EMPTY_VALUE}</Tag>
              <Tag color="green"><ApartmentOutlined /> {departmentLabel}</Tag>
            </Space>
            <div className="employee-show__contact">
              <span><MailOutlined /> {employee.email}</span>
              <span><PhoneOutlined /> {employee.phone ?? EMPTY_VALUE}</span>
              <span><EnvironmentOutlined /> {employee.address ?? EMPTY_VALUE}</span>
            </div>
          </div>
        </div>
        <div className="employee-show__quick-info">
          <DetailRow icon={<CalendarOutlined />} label="Ngày vào làm" value={formatDate(employee.joined_at)} />
          <DetailRow icon={<UserOutlined />} label="Ngày tạo tài khoản" value={formatDate(employee.created_at, true)} />
          <DetailRow icon={<SafetyCertificateOutlined />} label="Trạng thái tài khoản" value={<span className={`employee-show__status-text employee-show__status-text--${status}`}>{STATUS_LABELS[status]}</span>} />
          <DetailRow icon={<ClockCircleOutlined />} label="Cập nhật cuối" value={formatDate(employee.updated_at, true)} />
          <DetailRow icon={<UserOutlined />} label="Bởi" value={EMPTY_VALUE} />
        </div>
      </Card>

      <Card className="employee-show__tabs-card">
        <Tabs defaultActiveKey="general" items={[
          { key: "general", label: <span><UserOutlined /> Thông tin chung</span>, children: generalTab },
          { key: "permissions", label: <span><SafetyCertificateOutlined /> Vai trò & Quyền</span>, children: permissionsTab },
          { key: "activity", label: <span><HistoryOutlined /> Lịch sử hoạt động</span>, children: activityTab },
          { key: "notes", label: <span><FileTextOutlined /> Ghi chú</span>, children: <Card className="employee-show__section-card">{employee.note ? <Typography.Paragraph>{employee.note}</Typography.Paragraph> : <Empty description="Chưa có ghi chú nội bộ." />}</Card> },
          { key: "documents", label: <span><FileTextOutlined /> Tài liệu liên quan</span>, children: <Card className="employee-show__section-card"><Empty description="Chưa có tài liệu liên quan." /></Card> },
        ]} />
      </Card>

      <Modal
        open={editOpen}
        width={760}
        title="Cập nhật nhân viên"
        okText="Lưu thay đổi"
        cancelText="Hủy"
        confirmLoading={saving}
        onCancel={() => setEditOpen(false)}
        onOk={() => void saveEdit()}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={12}><Form.Item label="Họ và tên" name="name" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label="Email" name="email" rules={[{ required: true }, { type: "email" }]}><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label="Số điện thoại" name="phone"><Input /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label="Ngày sinh" name="birthday"><DatePicker format={DATE_FORMAT} style={{ width: "100%" }} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label="Giới tính" name="gender"><Select allowClear options={genderOptions} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label="Ngày vào làm" name="joined_at"><DatePicker format={DATE_FORMAT} style={{ width: "100%" }} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label="Phòng ban" name="department" rules={[{ required: true }]}><Select options={departmentOptions} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label="Vai trò" name="role_id" rules={[{ required: true }]}><Select options={roles.map((role) => ({ value: String(role.id), label: role.name }))} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label="Quản lý trực tiếp" name="manager_id"><Select allowClear showSearch optionFilterProp="label" options={managers.map((manager) => ({ value: String(manager.id), label: `${manager.name}${manager.role?.name ? ` (${manager.role.name})` : ""}` }))} /></Form.Item></Col>
            <Col xs={24} md={12}><Form.Item label="Trạng thái" name="status" rules={[{ required: true }]}><Select options={statusOptions} /></Form.Item></Col>
            <Col xs={24}><Form.Item label="Địa chỉ" name="address"><Input /></Form.Item></Col>
            <Col xs={24}><Form.Item label="Ghi chú" name="note"><Input.TextArea rows={3} /></Form.Item></Col>
            <Col xs={24}><Form.Item label="Mật khẩu mới" name="password" rules={[{ min: 6, message: "Mật khẩu phải có ít nhất 6 ký tự." }]}><Input.Password placeholder="Để trống nếu không đổi mật khẩu" /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};
