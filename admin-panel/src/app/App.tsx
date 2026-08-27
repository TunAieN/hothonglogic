import { Refine } from "@refinedev/core";
import routerProvider from "@refinedev/react-router";
import { BrowserRouter } from "react-router";
import "@refinedev/antd/dist/reset.css";

import { authProvider } from "../providers/authProvider";
import { dataProvider } from "../providers/dataProvider";
import { AppRoutes } from "./routes";
import { resources } from "./resources";

function App() {
  return (
    <BrowserRouter>
      <Refine
        authProvider={authProvider}
        dataProvider={dataProvider}
        routerProvider={routerProvider}
        resources={resources}
      >
        <AppRoutes />
      </Refine>
    </BrowserRouter>
  );
}

export default App;
