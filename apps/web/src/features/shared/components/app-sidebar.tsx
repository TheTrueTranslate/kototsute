import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarHeader,
  SidebarTrigger
} from "./ui/sidebar";
import { Bell, CircleUser, Folder, LogOut, Mail } from "lucide-react";
import { listNotifications } from "../../../app/api/notifications";
import { auth } from "../lib/firebase";
import { signOut } from "firebase/auth";
import { useAuth } from "../../auth/auth-provider";

const mainItems = [
  {
    title: "ケース",
    url: "/cases",
    icon: Folder
  },
  {
    title: "招待",
    url: "/invites",
    icon: Mail
  },
  {
    title: "通知",
    url: "/notifications",
    icon: Bell
  }
];

const accountItems = [
  {
    title: "マイページ",
    url: "/me",
    icon: CircleUser
  }
];

export default function AppSidebar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const notifications = await listNotifications();
        const count = notifications.filter((item) => !item.isRead).length;
        if (!cancelled) {
          setUnreadCount(count);
        }
      } catch {
        if (!cancelled) {
          setUnreadCount(0);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="px-4 pt-4">
        <div className="flex items-center justify-end">
          <SidebarTrigger className="h-9 w-9" />
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>メニュー</SidebarGroupLabel>
          <SidebarMenu>
            {mainItems.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  className="h-11 text-[0.95rem] font-medium"
                >
                  <Link to={item.url}>
                    <span className="relative">
                      <item.icon className="size-5" />
                      {item.url === "/notifications" && unreadCount > 0 ? (
                        <span className="absolute -right-2 -top-2 inline-flex min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[0.65rem] font-semibold text-white">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      ) : null}
                    </span>
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            <SidebarSeparator className="my-2" />
            {accountItems.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  className="h-11 text-[0.95rem] font-medium"
                >
                  <Link to={item.url}>
                    <item.icon className="size-5" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={handleLogout}
                className="h-11 text-[0.95rem] font-medium"
              >
                <LogOut className="size-5" />
                <span>ログアウト</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
