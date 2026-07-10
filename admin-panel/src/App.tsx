import { lazy, Suspense } from "react";
import { Authenticated, Refine } from "@refinedev/core";
import { ErrorComponent } from "@refinedev/antd";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import "@refinedev/antd/dist/reset.css";
import routerProvider from "@refinedev/react-router";
import { authProvider } from "./providers/authProvider";
import { dataProvider } from "./providers/dataProvider";
import { CustomLayout } from "./layout";
import { RouteLoadingFallback } from "./components/admin-loading";

const LoginPage = lazy(() =>
  import("./pages/auth/LoginPage").then((module) => ({ default: module.LoginPage })),
);
const CustomerCreate = lazy(() =>
  import("./pages/customers/create").then((module) => ({ default: module.CustomerCreate })),
);
const CustomerEdit = lazy(() =>
  import("./pages/customers/edit").then((module) => ({ default: module.CustomerEdit })),
);
const CustomerList = lazy(() =>
  import("./pages/customers/list").then((module) => ({ default: module.CustomerList })),
);
const CustomerShow = lazy(() =>
  import("./pages/customers/show").then((module) => ({ default: module.CustomerShow })),
);
const ExternalOrderLayout = lazy(() =>
  import("./layouts/ExternalOrderLayout").then((module) => ({ default: module.ExternalOrderLayout })),
);
const ExternalOrderCreate = lazy(() =>
  import("./pages/external-orders/ExternalOrderCreate").then((module) => ({
    default: module.ExternalOrderCreate,
  })),
);
const ChinaWarehousePage = lazy(() =>
  import("./pages/china-warehouse").then((module) => ({ default: module.ChinaWarehousePage })),
);
const CnBatchesPage = lazy(() =>
  import("./pages/cn-batches").then((module) => ({ default: module.CnBatchesPage })),
);
const OrderEdit = lazy(() =>
  import("./pages/orders/edit").then((module) => ({ default: module.OrderEdit })),
);
const OrderList = lazy(() =>
  import("./pages/orders/list").then((module) => ({ default: module.OrderList })),
);
const OrderShow = lazy(() =>
  import("./pages/orders/show").then((module) => ({ default: module.OrderShow })),
);
const VietnamWarehousePage = lazy(() =>
  import("./pages/vietnam-warehouse").then((module) => ({ default: module.VietnamWarehousePage })),
);
const DashboardPage = lazy(() =>
  import("./pages/dashboard").then((module) => ({ default: module.DashboardPage })),
);
const EmployeesPage = lazy(() =>
  import("./pages/employees").then((module) => ({ default: module.EmployeesPage })),
);
const PaymentVouchersPage = lazy(() =>
  import("./pages/payment-vouchers").then((module) => ({ default: module.PaymentVouchersPage })),
);
const PaymentVoucherShow = lazy(() =>
  import("./pages/payment-vouchers/show").then((module) => ({ default: module.PaymentVoucherShow })),
);
const ShippingRatesPage = lazy(() =>
  import("./pages/shipping-rates").then((module) => ({ default: module.ShippingRatesPage })),
);

const RouteFallback = RouteLoadingFallback;

const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const redirect = `${location.pathname}${location.search}`;

  return (
    <Authenticated
      key={`auth-${location.pathname}`}
      fallback={<Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />}
    >
      <>{children}</>
    </Authenticated>
  );
};

function App() {
  return (
    <BrowserRouter>
      <Refine
        authProvider={authProvider}
        dataProvider={dataProvider}
        routerProvider={routerProvider}
        resources={[
          {
            name: "customers",
            list: "/customers",
            create: "/customers/create",
            edit: "/customers/edit/:id",
            show: "/customers/show/:id",
            meta: {
              canDelete: true,
            },
          },
          {
            name: "orders",
            list: "/orders",
            create: "/orders/external/create",
            edit: "/orders/edit/:id",
            show: "/orders/show/:id",
            meta: {
              canDelete: true,
            },
          },
          {
            name: "cnBatches",
            list: "/cn-batches",
          },
          {
            name: "cnPackages",
            list: "/china-warehouse",
          },
          {
            name: "vnWarehouse",
            list: "/vietnam-warehouse",
          },
          {
            name: "paymentVouchers",
            list: "/payment-vouchers",
            show: "/payment-vouchers/:id",
          },
          {
            name: "shippingRates",
            list: "/shipping-rates",
          },
          {
            name: "employees",
            list: "/employees",
          },
          {
            name: "users",
          },
        ]}
      >
        <Suspense fallback={<RouteFallback />}>
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
              <Route path="/shipping-rates" element={<ShippingRatesPage />} />
              <Route path="/employees" element={<EmployeesPage />} />

              <Route path="/fleet" element={<Navigate to="/employees" replace />} />
              <Route path="/routes" element={<DashboardPage />} />
              <Route path="/analytics" element={<DashboardPage />} />

              <Route path="*" element={<ErrorComponent />} />
            </Route>
          </Routes>
        </Suspense>
      </Refine>
    </BrowserRouter>
  );
}

export default App;
