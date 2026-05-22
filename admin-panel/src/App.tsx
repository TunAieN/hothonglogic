import { Authenticated, Refine } from "@refinedev/core";
import { ErrorComponent } from "@refinedev/antd";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import "@refinedev/antd/dist/reset.css";
import routerProvider from "@refinedev/react-router";
import { authProvider } from "./providers/authProvider";
import { dataProvider } from "./providers/dataProvider";
import { LoginPage } from "./pages/auth/LoginPage";
import { CustomerCreate } from "./pages/customers/create";
import { CustomerEdit } from "./pages/customers/edit";
import { CustomerList } from "./pages/customers/list";
import { CustomerShow } from "./pages/customers/show";
import { ExternalOrderLayout } from "./layouts/ExternalOrderLayout";
import { ExternalOrderCreate } from "./pages/external-orders/ExternalOrderCreate";
import { OrderEdit } from "./pages/orders/edit";
import { OrderList } from "./pages/orders/list";
import { OrderShow } from "./pages/orders/show";

import { CustomLayout } from "./layout";
import { DashboardPage } from "./pages/dashboard";

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
        ]}
      >
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
          {/* <Route
            path="/orders/edit/:id"
            element={
              <RequireAuth>
                <OrderEdit />
              </RequireAuth>
            }
          /> */}
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
            
            {/* Added for menu items so they don't 404 immediately */}
            <Route path="/fleet" element={<DashboardPage />} />
            <Route path="/routes" element={<DashboardPage />} />
            <Route path="/analytics" element={<DashboardPage />} />

            <Route path="*" element={<ErrorComponent />} />
          </Route>
        </Routes>
      </Refine>
    </BrowserRouter>
  );
}

export default App;
