import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPage from "./pages/ResetPage";
import AssetsPage from "./pages/AssetsPage";
import AssetNewPage from "./pages/AssetNewPage";
import { Footer, Header, type HeaderNavItem } from "@kototsute/ui";
import { auth } from "../lib/firebase";

export default function App() {
  const navItems: HeaderNavItem[] = [
    { label: "資産", href: "/assets" }
  ];

  const [showNav, setShowNav] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => setShowNav(Boolean(user)));
    return () => unsubscribe();
  }, []);

  return (
    <div className="app">
      <Header showNav={showNav} navItems={navItems} />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/reset" element={<ResetPage />} />
          <Route path="/assets" element={<AssetsPage />} />
          <Route path="/assets/new" element={<AssetNewPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
