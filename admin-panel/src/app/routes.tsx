import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { ErrorComponent } from "@refinedev/antd";
import { Navigate, Outlet, Route, Routes } from "react-router";

import { CustomLayout } from "../layouts/admin";
import { RouteLoadingFallback } from "../shared/components/admin-loading";
import { RequireAuth } from "./auth/RequireAuth";
import { RequirePermission } from "./auth/RequirePermission";
import { ForbiddenPage } from "../pages/errors/ForbiddenPage";

const allow = (permission: string, element: ReactNode) => (
  <RequirePermission permission={permission}>{element}</RequirePermission>
);

const LoginPage = lazy(() =>
  import("../pages/auth/LoginPage").then((module) => ({ default: module.LoginPage })),
);
const CustomerCreate = lazy(() =>
  import("../pages/customers/create").then((module) => ({ default: module.CustomerCreate })),
);
const CustomerEdit = lazy(() =>
  import("../pages/customers/edit").then((module) => ({ default: module.CustomerEdit })),
);
const CustomerList = lazy(() =>
  import("../pages/customers/list").then((module) => ({ default: module.CustomerList })),
);
const CustomerShow = lazy(() =>
  import("../pages/customers/show").then((module) => ({ default: module.CustomerShow })),
);
const ExternalOrderLayout = lazy(() =>
  import("../layouts/ExternalOrderLayout").then((module) => ({ default: module.ExternalOrderLayout })),
);
const ExternalOrderCreate = lazy(() =>
  import("../pages/external-orders/ExternalOrderCreate").then((module) => ({
    default: module.ExternalOrderCreate,
  })),
);
const ChinaWarehousePage = lazy(() =>
  import("../pages/china-warehouse").then((module) => ({ default: module.ChinaWarehousePage })),
);
const CnBatchesPage = lazy(() =>
  import("../pages/cn-batches").then((module) => ({ default: module.CnBatchesPage })),
);
const OrderEdit = lazy(() =>
  import("../pages/orders/edit").then((module) => ({ default: module.OrderEdit })),
);
const OrderList = lazy(() =>
  import("../pages/orders/list").then((module) => ({ default: module.OrderList })),
);
const OrderShow = lazy(() =>
  import("../pages/orders/show").then((module) => ({ default: module.OrderShow })),
);
const VietnamWarehousePage = lazy(() =>
  import("../pages/vietnam-warehouse").then((module) => ({ default: module.VietnamWarehousePage })),
);
const DashboardPage = lazy(() =>
  import("../pages/dashboard").then((module) => ({ default: module.DashboardPage })),
);
const EmployeesPage = lazy(() =>
  import("../pages/employees").then((module) => ({ default: module.EmployeesPage })),
);
const EmployeeShowPage = lazy(() =>
  import("../pages/employees/show").then((module) => ({ default: module.EmployeeShowPage })),
);
const PaymentVouchersPage = lazy(() =>
  import("../pages/payment-vouchers").then((module) => ({ default: module.PaymentVouchersPage })),
);
const PaymentVoucherShow = lazy(() =>
  import("../pages/payment-vouchers/show").then((module) => ({ default: module.PaymentVoucherShow })),
);
const ShippingRatesPage = lazy(() =>
  import("../pages/shipping-rates").then((module) => ({ default: module.ShippingRatesPage })),
);
const ExchangeRatesPage = lazy(() =>
  import("../pages/exchange-rates").then((module) => ({ default: module.ExchangeRatesPage })),
);
const InvoiceListPage = lazy(() =>
  import("../pages/invoices").then((module) => ({ default: module.InvoiceListPage })),
);
const InvoiceCreatePage = lazy(() =>
  import("../pages/invoices/create").then((module) => ({ default: module.InvoiceCreatePage })),
);
const InvoiceDetailPage = lazy(() =>
  import("../pages/invoices/show").then((module) => ({ default: module.InvoiceDetailPage })),
);
const RevenueReportPage = lazy(() =>
  import("../pages/revenue-report").then((module) => ({ default: module.RevenueReportPage })),
);
const ShippingQueuePage = lazy(() =>
  import("../pages/shipping/QueuePage").then((module) => ({ default: module.ShippingQueuePage })),
);
const CreateShippingTaskPage = lazy(() =>
  import("../pages/shipping/CreateTaskPage").then((module) => ({ default: module.CreateShippingTaskPage })),
);
const ShippingTaskListPage = lazy(() =>
  import("../pages/shipping/ListPages").then((module) => ({ default: module.ShippingTaskListPage })),
);
const ShippingTaskDetailPage = lazy(() =>
  import("../pages/shipping/TaskDetailPage").then((module) => ({ default: module.ShippingTaskDetailPage })),
);
const ExportSlipListPage = lazy(() =>
  import("../pages/shipping/ListPages").then((module) => ({ default: module.ExportSlipListPage })),
);
const ExportSlipDetailPage = lazy(() =>
  import("../pages/shipping/SlipDetailPage").then((module) => ({ default: module.ExportSlipDetailPage })),
);

export const AppRoutes = () => (
  <Suspense fallback={<RouteLoadingFallback />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/orders/external/create"
        element={
          <RequireAuth>
            <ExternalOrderLayout>
              {allow("orders.create", <ExternalOrderCreate />)}
            </ExternalOrderLayout>
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <CustomLayout>
              <Outlet />
            </CustomLayout>
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="/403" element={<ForbiddenPage />} />

        <Route path="/customers">
          <Route index element={allow("customers.read", <CustomerList />)} />
          <Route path="create" element={allow("customers.create", <CustomerCreate />)} />
          <Route path="edit/:id" element={allow("customers.update", <CustomerEdit />)} />
          <Route path="show/:id" element={allow("customers.read", <CustomerShow />)} />
        </Route>

        <Route path="/orders">
          <Route index element={allow("orders.read", <OrderList />)} />
          <Route path="show/:id" element={allow("orders.read", <OrderShow />)} />
          <Route path="edit/:id" element={allow("orders.update", <OrderEdit />)} />
        </Route>

        <Route path="/cn-batches" element={allow("cn_batches.read", <CnBatchesPage />)} />
        <Route path="/china-warehouse" element={allow("cn_packages.read", <ChinaWarehousePage />)} />
        <Route path="/vietnam-warehouse" element={allow("vn_warehouse.read", <VietnamWarehousePage />)} />
        <Route path="/payment-vouchers" element={allow("payment_vouchers.read", <PaymentVouchersPage />)} />
        <Route path="/payment-vouchers/:id" element={allow("payment_vouchers.read", <PaymentVoucherShow />)} />
        <Route path="/invoices" element={allow("invoices.read", <InvoiceListPage />)} />
        <Route path="/invoices/create" element={allow("invoices.create", <InvoiceCreatePage />)} />
        <Route path="/invoices/:id" element={allow("invoices.read", <InvoiceDetailPage />)} />
        <Route path="/revenue-report" element={allow("revenue_report.read", <RevenueReportPage />)} />
        <Route path="/shipping-rates" element={allow("shipping_rates.read", <ShippingRatesPage />)} />
        <Route path="/exchange-rates" element={allow("exchange_rates.read", <ExchangeRatesPage />)} />
        <Route path="/employees" element={allow("employees.read", <EmployeesPage />)} />
        <Route path="/employees/:id" element={allow("employees.read", <EmployeeShowPage />)} />
        <Route path="/shipping" element={<Navigate to="/shipping/queue" replace />} />
        <Route path="/shipping/queue" element={allow("shipping_queue.read", <ShippingQueuePage />)} />
        <Route path="/shipping/create" element={allow("shipping_tasks.create", <CreateShippingTaskPage />)} />
        <Route path="/shipping/tasks" element={allow("shipping_tasks.read", <ShippingTaskListPage />)} />
        <Route path="/shipping/tasks/:id" element={allow("shipping_tasks.read", <ShippingTaskDetailPage />)} />
        <Route path="/shipping/slips" element={allow("export_slips.read", <ExportSlipListPage />)} />
        <Route path="/shipping/slips/:id" element={allow("export_slips.read", <ExportSlipDetailPage />)} />

        <Route path="/fleet" element={<Navigate to="/employees" replace />} />
        <Route path="/routes" element={allow("settings.read", <DashboardPage />)} />
        <Route path="/analytics" element={allow("audit_logs.read", <DashboardPage />)} />

        <Route path="*" element={<ErrorComponent />} />
      </Route>
    </Routes>
  </Suspense>
);
