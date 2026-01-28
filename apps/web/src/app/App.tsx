import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPage from "./pages/ResetPage";
import AssetsPage from "./pages/AssetsPage";
import AssetNewPage from "./pages/AssetNewPage";
import { Footer, Header } from "@kototsute/ui";
import AppSidebar from "../components/app-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";

export default function App() {
  return (
    <div className="app">
      <Header showNav={false} />
      <SidebarProvider defaultOpen>
        <AppSidebar />
        <SidebarInset className="app-main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/reset" element={<ResetPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/assets/new" element={<AssetNewPage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
          <Footer />
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
