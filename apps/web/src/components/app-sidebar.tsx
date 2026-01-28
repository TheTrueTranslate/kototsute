import { Link, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarHeader,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { Wallet, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const mainItems = [
  {
    title: "資産",
    url: "/assets",
    icon: Wallet
  }
];

const secondaryItems = [
  {
    title: "設定",
    icon: Settings
  },
  {
    title: "ログアウト",
    icon: LogOut
  }
];

export default function AppSidebar() {
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            ナビゲーション
          </div>
          <SidebarTrigger className="h-8 w-8" />
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>メニュー</SidebarGroupLabel>
          <SidebarMenu>
            {mainItems.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton asChild isActive={pathname.startsWith(item.url)} tooltip={item.title}>
                  <Link to={item.url}>
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel>準備中</SidebarGroupLabel>
          <SidebarMenu>
            {secondaryItems.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  type="button"
                  tooltip={`${item.title}（準備中）`}
                  className={cn("text-muted-foreground", "cursor-not-allowed")}
                  aria-disabled
                >
                  <item.icon className="size-4" />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-4 pb-4 text-xs text-muted-foreground">
        追加項目は順次公開予定です。
      </SidebarFooter>
    </Sidebar>
  );
}
