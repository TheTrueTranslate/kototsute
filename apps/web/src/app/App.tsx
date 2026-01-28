import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPage from "./pages/ResetPage";
import { Footer, Header, type HeaderNavItem } from "@kototsute/ui";
import styles from "../styles/layout.module.css";

export default function App() {
  const navItems: HeaderNavItem[] = [
    { label: "ホーム", href: "/" },
    { label: "設定", href: "/settings" }
  ];

  const showNav = false;

  return (
    <div className="app">
      <Header showNav={showNav} navItems={navItems} />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/reset" element={<ResetPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
