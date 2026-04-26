import { Refine } from "@refinedev/core";
import { ErrorComponent } from "@refinedev/antd";
import { BrowserRouter, Routes, Route, Outlet } from "react-router";
import "@refinedev/antd/dist/reset.css";
import routerProvider from "@refinedev/react-router";
import { dataProvider } from "./providers/dataProvider";
import { CustomerCreate } from "./pages/customers/create";
import { CustomerList } from "./pages/customers/list";
import { CustomerShow } from "./pages/customers/show";
import { OrderList } from "./pages/orders/list";
import { OrderShow } from "./pages/orders/show";

import { CustomLayout } from "./layout";
import { DashboardPage } from "./pages/dashboard";

function App() {
  return (
    <BrowserRouter>
      <Refine
        dataProvider={dataProvider}
        routerProvider={routerProvider}
        resources={[
          {
            name: "customers",
            list: "/customers",
            create: "/customers/create",
            show: "/customers/show/:id",
            meta: {
              canDelete: true,
            },
          },
          {
            name: "orders",
            list: "/orders",
            show: "/orders/show/:id",
            meta: {
              canDelete: true,
            },
          },
        ]}
      >
        <Routes>
          <Route
            element={
              <CustomLayout>
                <Outlet />
              </CustomLayout>
            }
          >
            <Route index element={<DashboardPage />} />
            
            <Route path="/customers">
              <Route index element={<CustomerList />} />
              <Route path="create" element={<CustomerCreate />} />
              <Route path="show/:id" element={<CustomerShow />} />
            </Route>
            
            <Route path="/orders">
              <Route index element={<OrderList />} />
              <Route path="show/:id" element={<OrderShow />} />
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
