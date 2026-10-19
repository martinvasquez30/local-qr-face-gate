import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n.js"; // Set up translations before the first render.
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
