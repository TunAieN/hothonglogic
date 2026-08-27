import { lazy, Suspense } from "react";
import { ErrorComponent } from "@refinedev/antd";
import { Navigate, Outlet, Route, Routes } from "react-router";

import { CustomLayout } from "../layouts/admin";
import { RouteLoadingFallback } from "../shared/components/admin-loading";
import { RequireAuth } from "./auth/RequireAuth";

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
              <ExternalOrderCreate />
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

        <Route path="/customers">
          <Route index element={<CustomerList />} />
          <Route path="create" element={<CustomerCreate />} />
          <Route path="edit/:id" element={<CustomerEdit />} />
          <Route path="show/:id" element={<CustomerShow />} />
        </Route>

        <Route path="/orders">
          <Route index element={<OrderList />} />
          <Route path="show/:id" element={<OrderShow />} />
          <Route path="edit/:id" element={<OrderEdit />} />
        </Route>

        <Route path="/cn-batches" element={<CnBatchesPage />} />
        <Route path="/china-warehouse" element={<ChinaWarehousePage />} />
        <Route path="/vietnam-warehouse" element={<VietnamWarehousePage />} />
        <Route path="/payment-vouchers" element={<PaymentVouchersPage />} />
        <Route path="/payment-vouchers/:id" element={<PaymentVoucherShow />} />
        <Route path="/invoices" element={<InvoiceListPage />} />
        <Route path="/invoices/create" element={<InvoiceCreatePage />} />
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/revenue-report" element={<RevenueReportPage />} />
        <Route path="/shipping-rates" element={<ShippingRatesPage />} />
        <Route path="/exchange-rates" element={<ExchangeRatesPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/shipping" element={<Navigate to="/shipping/queue" replace />} />
        <Route path="/shipping/queue" element={<ShippingQueuePage />} />
        <Route path="/shipping/create" element={<CreateShippingTaskPage />} />
        <Route path="/shipping/tasks" element={<ShippingTaskListPage />} />
        <Route path="/shipping/tasks/:id" element={<ShippingTaskDetailPage />} />
        <Route path="/shipping/slips" element={<ExportSlipListPage />} />
        <Route path="/shipping/slips/:id" element={<ExportSlipDetailPage />} />

        <Route path="/fleet" element={<Navigate to="/employees" replace />} />
        <Route path="/routes" element={<DashboardPage />} />
        <Route path="/analytics" element={<DashboardPage />} />

        <Route path="*" element={<ErrorComponent />} />
      </Route>
    </Routes>
  </Suspense>
);
