import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPage from "./pages/ResetPage";
import CasesPage from "./pages/CasesPage";
import CaseDetailPage from "./pages/CaseDetailPage";
import AssetLockPage from "./pages/AssetLockPage";
import AssetNewPage from "./pages/AssetNewPage";
import AssetDetailPage from "./pages/AssetDetailPage";
import PlanNewPage from "./pages/PlanNewPage";
import PlanEditPage from "./pages/PlanEditPage";
import CasePlanDetailPage from "./pages/CasePlanDetailPage";
import NotificationsPage from "./pages/NotificationsPage";
import MyPage from "./pages/MyPage";
import InvitesPage from "./pages/InvitesPage";
import AppSidebar from "../features/shared/components/app-sidebar";
import { SidebarProvider, SidebarInset } from "../features/shared/components/ui/sidebar";
import SiteHeader from "../features/shared/components/site-header";
import SiteFooter from "../features/shared/components/site-footer";
import { AuthProvider, useAuth } from "../features/auth/auth-provider";
import RequireAuth from "../features/auth/require-auth";
import { useEffect, useState } from "react";
import { useIsMobile } from "../hooks/use-mobile";
import { LocaleProvider } from "../features/shared/providers/LocaleProvider";

export default function App() {
  return (
    <AuthProvider>
      <LocaleProvider>
        <AppShell />
      </LocaleProvider>
    </AuthProvider>
  );
}

function AppShell() {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user);
  const isMobile = useIsMobile();
  const location = useLocation();
  const isAuthRoute = ["/login", "/register", "/reset"].includes(location.pathname);
  const showSidebar = isAuthenticated && !isAuthRoute;
  const showHeader = isAuthenticated && !isAuthRoute;
  const storageKey = "sidebar-open";
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "true") return true;
    if (stored === "false") return false;
    return true;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) {
      const next = !isMobile;
      setSidebarOpen(next);
      window.localStorage.setItem(storageKey, String(next));
    }
  }, [isMobile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, String(sidebarOpen));
  }, [sidebarOpen, storageKey]);

  const content = (
    <>
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
          path="/cases/:caseId/asset-lock"
          element={
            <RequireAuth>
              <AssetLockPage />
            </RequireAuth>
          }
        />
        <Route
          path="/cases/:caseId/assets/:assetId"
          element={
            <RequireAuth>
              <AssetDetailPage />
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
          path="/cases/:caseId/plans/:planId/edit"
          element={
            <RequireAuth>
              <PlanEditPage />
            </RequireAuth>
          }
        />
        <Route
          path="/cases/:caseId/plans/:planId"
          element={
            <RequireAuth>
              <CasePlanDetailPage />
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
          path="/invites"
          element={
            <RequireAuth>
              <InvitesPage />
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
    </>
  );

  return (
    <div className="app">
      {showHeader ? (
        <SiteHeader
          showNav={false}
          showMenuButton={isMobile}
          onMenuClick={() => setSidebarOpen((prev) => !prev)}
        />
      ) : null}
      {showSidebar ? (
        <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen} className="flex-1 min-h-0">
          <AppSidebar />
          <SidebarInset className="app-main">{content}</SidebarInset>
        </SidebarProvider>
      ) : (
        <main className="app-main">{content}</main>
      )}
    </div>
  );
}
