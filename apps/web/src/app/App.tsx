import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPage from "./pages/ResetPage";
import CasesPage from "./pages/CasesPage";
import CaseDetailPage from "./pages/CaseDetailPage";
import AssetNewPage from "./pages/AssetNewPage";
import PlanNewPage from "./pages/PlanNewPage";
import NotificationsPage from "./pages/NotificationsPage";
import MyPage from "./pages/MyPage";
import AppSidebar from "../features/shared/components/app-sidebar";
import { SidebarProvider, SidebarInset } from "../features/shared/components/ui/sidebar";
import SiteHeader from "../features/shared/components/site-header";
import SiteFooter from "../features/shared/components/site-footer";
import { AuthProvider, useAuth } from "../features/auth/auth-provider";
import RequireAuth from "../features/auth/require-auth";
import { useEffect, useState } from "react";
import { useIsMobile } from "../hooks/use-mobile";

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
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  return (
    <div className="app">
      {isAuthenticated ? (
        <SiteHeader
          showNav={false}
          showMenuButton={isMobile}
          onMenuClick={() => setSidebarOpen((prev) => !prev)}
        />
      ) : null}
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen} className="flex-1 min-h-0">
        {isAuthenticated ? <AppSidebar /> : null}
        <SidebarInset className="app-main">
          <Routes>
            <Route
              path="/"
              element={
                isAuthenticated ? (
                  <RequireAuth>
                    <CasesPage />
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
              path="/cases"
              element={
                <RequireAuth>
                  <CasesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/cases/:caseId/assets/new"
              element={
                <RequireAuth>
                  <AssetNewPage />
                </RequireAuth>
              }
            />
            <Route
              path="/cases/:caseId/plans/new"
              element={
                <RequireAuth>
                  <PlanNewPage />
                </RequireAuth>
              }
            />
            <Route
              path="/cases/:caseId"
              element={
                <RequireAuth>
                  <CaseDetailPage />
                </RequireAuth>
              }
            />
            <Route
              path="/notifications"
              element={
                <RequireAuth>
                  <NotificationsPage />
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
