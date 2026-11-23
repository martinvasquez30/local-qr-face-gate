import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./i18n.js"; // Set up translations before the first render.
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
// Bootstrap first (grid, breakpoints, utility classes), then our own CSS, so
// our rules win when both style the same thing. Only the CSS is used: no
// Bootstrap JavaScript, React state handles what opens and closes.
import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* BrowserRouter keeps the page in sync with the URL (/, /users). */}
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
