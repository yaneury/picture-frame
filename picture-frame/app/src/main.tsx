import React from "react";
import ReactDOM from "react-dom/client";

import ConfigProvider from "./ConfigProvider";
import App from "./App";

import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
