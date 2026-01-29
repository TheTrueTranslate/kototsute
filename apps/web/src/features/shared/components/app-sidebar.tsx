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
  SidebarTrigger,
  useSidebar
} from "./ui/sidebar";
import { Bell, CircleUser, Folder, LogOut, Mail } from "lucide-react";
import { listNotifications } from "../../../app/api/notifications";
import { listInvitesReceivedAll } from "../../../app/api/invites";
import { auth } from "../lib/firebase";
import { signOut } from "firebase/auth";
import { useAuth } from "../../auth/auth-provider";
import FormAlert from "./form-alert";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "./ui/dialog";

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

export type NotificationBadgeVariant = "none" | "dot" | "count";

export const getNotificationBadgeVariant = (
  unreadCount: number,
  state: "expanded" | "collapsed"
): NotificationBadgeVariant => {
  if (unreadCount <= 0) return "none";
  return state === "collapsed" ? "dot" : "count";
};

export const getNotificationBadgeClass = (variant: Exclude<NotificationBadgeVariant, "none">) =>
  variant === "dot"
    ? "absolute right-0 top-0 inline-flex h-2.5 w-2.5 rounded-full bg-destructive"
    : "absolute -right-2 -top-2 inline-flex min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[0.65rem] font-semibold text-white";

export const getSidebarTriggerClass = (state: "expanded" | "collapsed") =>
  state === "collapsed"
    ? "h-9 w-full justify-center rounded-lg"
    : "h-9 w-9";

export default function AppSidebar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const [unreadCount, setUnreadCount] = useState(0);
  const [inviteCount, setInviteCount] = useState(0);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!user) {
      setInviteCount(0);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const invites = await listInvitesReceivedAll();
        const count = invites.filter((invite) => invite.status === "pending").length;
        if (!cancelled) {
          setInviteCount(count);
        }
      } catch {
        if (!cancelled) {
          setInviteCount(0);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await signOut(auth);
      navigate("/login");
      return true;
    } catch (err: any) {
      setLogoutError(err?.message ?? "ログアウトに失敗しました。");
      return false;
    }
  };

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="px-4 pt-4 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center justify-end">
          <SidebarTrigger className={getSidebarTriggerClass(state)} />
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
                      {item.url === "/notifications"
                        ? (() => {
                            const variant = getNotificationBadgeVariant(unreadCount, state);
                            if (variant === "none") return null;
                            if (variant === "dot") {
                              return (
                                <span
                                  className={getNotificationBadgeClass("dot")}
                                  aria-label={`未読${unreadCount}件`}
                                  role="status"
                                />
                              );
                            }
                            return (
                              <span className={getNotificationBadgeClass("count")}>
                                {unreadCount > 99 ? "99+" : unreadCount}
                              </span>
                            );
                          })()
                        : null}
                      {item.url === "/invites"
                        ? (() => {
                            const variant = getNotificationBadgeVariant(inviteCount, state);
                            if (variant === "none") return null;
                            if (variant === "dot") {
                              return (
                                <span
                                  className={getNotificationBadgeClass("dot")}
                                  aria-label={`招待${inviteCount}件`}
                                  role="status"
                                />
                              );
                            }
                            return (
                              <span className={getNotificationBadgeClass("count")}>
                                {inviteCount > 99 ? "99+" : inviteCount}
                              </span>
                            );
                          })()
                        : null}
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
              <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
                <DialogTrigger asChild>
                  <SidebarMenuButton className="h-11 text-[0.95rem] font-medium">
                    <LogOut className="size-5" />
                    <span>ログアウト</span>
                  </SidebarMenuButton>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>ログアウトしますか？</DialogTitle>
                    <DialogDescription>現在のセッションを終了します。</DialogDescription>
                  </DialogHeader>
                  {logoutError ? <FormAlert variant="error">{logoutError}</FormAlert> : null}
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline">
                        キャンセル
                      </Button>
                    </DialogClose>
                    <Button
                      type="button"
                      onClick={async () => {
                        const ok = await handleLogout();
                        if (ok) {
                          setLogoutOpen(false);
                        }
                      }}
                    >
                      ログアウト
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
