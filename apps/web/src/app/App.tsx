import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPage from "./pages/ResetPage";
import AssetsPage from "./pages/AssetsPage";
import AssetNewPage from "./pages/AssetNewPage";
import AssetDetailPage from "./pages/AssetDetailPage";
import MyPage from "./pages/MyPage";
import AppSidebar from "../components/app-sidebar";
import { SidebarProvider, SidebarInset } from "../components/ui/sidebar";
import SiteHeader from "../components/site-header";
import SiteFooter from "../components/site-footer";
import { AuthProvider, useAuth } from "./auth/auth-provider";
import RequireAuth from "./auth/require-auth";

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AppShell() {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);

  return (
    <div className="app">
      {isAuthenticated ? <SiteHeader showNav={false} /> : null}
      <SidebarProvider defaultOpen className="flex-1 min-h-0">
        {isAuthenticated ? <AppSidebar /> : null}
        <SidebarInset className="app-main">
          <Routes>
            <Route
              path="/"
              element={
                isAuthenticated ? (
                  <RequireAuth>
                    <AssetsPage />
                  </RequireAuth>
                ) : (
                  <HomePage />
                )
              }
            />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/reset" element={<ResetPage />} />
            <Route
              path="/assets"
              element={
                <RequireAuth>
                  <AssetsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/assets/new"
              element={
                <RequireAuth>
                  <AssetNewPage />
                </RequireAuth>
              }
            />
            <Route
              path="/assets/:assetId"
              element={
                <RequireAuth>
                  <AssetDetailPage />
                </RequireAuth>
              }
            />
            <Route
              path="/me"
              element={
                <RequireAuth>
                  <MyPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
          <SiteFooter />
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
