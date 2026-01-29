import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPage from "./pages/ResetPage";
import AssetsPage from "./pages/AssetsPage";
import AssetNewPage from "./pages/AssetNewPage";
import AssetDetailPage from "./pages/AssetDetailPage";
import InvitesPage from "./pages/InvitesPage";
import InvitesReceivedPage from "./pages/InvitesReceivedPage";
import PlansPage from "./pages/PlansPage";
import PlanNewPage from "./pages/PlanNewPage";
import PlanDetailPage from "./pages/PlanDetailPage";
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
              path="/invites"
              element={
                <RequireAuth>
                  <InvitesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/invites/received"
              element={
                <RequireAuth>
                  <InvitesReceivedPage />
                </RequireAuth>
              }
            />
            <Route
              path="/plans"
              element={
                <RequireAuth>
                  <PlansPage />
                </RequireAuth>
              }
            />
            <Route
              path="/plans/new"
              element={
                <RequireAuth>
                  <PlanNewPage />
                </RequireAuth>
              }
            />
            <Route
              path="/plans/:planId"
              element={
                <RequireAuth>
                  <PlanDetailPage />
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
