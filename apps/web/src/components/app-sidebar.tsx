import { Link } from "react-router-dom";
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
import { CircleUser, House, Mail, UserPlus, Wallet } from "lucide-react";

const mainItems = [
  {
    title: "ホーム",
    url: "/",
    icon: House
  },
  {
    title: "資産",
    url: "/assets",
    icon: Wallet
  },
  {
    title: "相続人",
    url: "/invites",
    icon: UserPlus
  },
  {
    title: "招待",
    url: "/invites/received",
    icon: Mail
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
                    <item.icon className="size-5" />
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
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
