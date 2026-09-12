import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Archive,
  Ban,
  Bell,
  Bike,
  CalendarDays,
  CalendarX,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  Tags,
  UserCheck,
  Users,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";

import logo from "@/assets/logo-shp.png.asset.json";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { recordAdminActivityEvent } from "@/lib/admin-activity";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

const groups = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
      { title: "Appointments Management", url: "/admin/appointments", icon: CalendarDays },
    ],
  },
  {
    label: "Shop",
    items: [
      { title: "Services", url: "/admin/services", icon: Wrench },
      { title: "Parts & Accessories", url: "/admin/parts", icon: Package },
      { title: "Motorcycle Catalog", url: "/admin/motorcycles", icon: Bike },
    ],
  },
  {
    label: "Business",
    items: [
      { title: "Prices Management", url: "/admin/prices", icon: Tags },
      { title: "Customer List", url: "/admin/customers", icon: Users },
    ],
  },
  {
    label: "Staff",
    items: [
      { title: "Mechanics", url: "/admin/mechanics", icon: UserCheck },
      { title: "Availability", url: "/admin/availability", icon: CalendarDays },
      { title: "Blocked Customers", url: "/admin/blocked-numbers", icon: Ban },
    ],
  },
  {
    label: "Shop Schedule",
    items: [{ title: "Schedule Blocks", url: "/admin/schedule-blocks", icon: CalendarX }],
  },
  {
    label: "Records",
    items: [
      { title: "Reports", url: "/admin/reports", icon: ClipboardList },
      { title: "Archive", url: "/admin/archive", icon: Archive },
      { title: "Activity Log", url: "/admin/activity-log", icon: History },
    ],
  },
];

function AdminLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const role = useQuery({
    queryKey: ["my-role"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role");
      return (data ?? []).map((r) => r.role);
    },
  });

  const unread = useQuery({
    queryKey: ["unread-notifications"],
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  async function signOut() {
    try {
      await recordAdminActivityEvent({
        action: "signed out",
        resourceType: "Authentication",
        targetLabel: "Admin console",
        summary: "Administrator signed out of the admin console.",
      });
    } catch {
      // Sign-out should always complete, even if the audit service is unavailable.
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const isAdmin = (role.data ?? []).includes("admin");

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar collapsible="icon">
          <SidebarContent>
            <div className="flex-shrink-0">
              <div className="flex items-center gap-2 px-3 py-4">
                <img src={logo.url} alt="Fake Rider logo" className="h-16 w-auto object-contain" />
                <span className="-ml-4 font-display text-sm leading-tight tracking-wide uppercase">
                  Fake Rider
                  <span className="block text-[10px] text-muted-foreground">Admin console</span>
                </span>
              </div>
            </div>
            {groups.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel className="text-[10px] tracking-[0.2em] uppercase">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          asChild
                          isActive={path === item.url}
                          tooltip={item.title}
                        >
                          <Link to={item.url} className="flex items-center gap-2">
                            <item.icon className="h-4 w-4" />
                            <span className="truncate text-xs uppercase">{item.title}</span>
                            {item.url === "/admin/notifications" && (unread.data ?? 0) > 0 && (
                              <Badge className="ml-auto h-5 min-w-5 justify-center bg-primary px-1 text-[10px] text-primary-foreground">
                                {unread.data}
                              </Badge>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
            {isAdmin && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-[10px] tracking-[0.2em] uppercase">
                  System
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={path === "/admin/settings"}
                        tooltip="Settings"
                      >
                        <Link to="/admin/settings" className="flex items-center gap-2">
                          <Settings className="h-4 w-4" />
                          <span className="truncate text-xs uppercase">Settings</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>
        </Sidebar>

        <div className="flex min-h-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur sm:gap-3 sm:px-4">
            <SidebarTrigger />
            <Link
              to="/"
              className="hidden text-xs text-muted-foreground uppercase hover:text-foreground sm:block"
            >
              View public site
            </Link>
            <ThemeToggle />
            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
              {isAdmin && (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  aria-label="Open settings"
                  title="Settings"
                >
                  <Link to="/admin/settings">
                    <Settings className="h-4 w-4" />
                  </Link>
                </Button>
              )}
              <Link to="/admin/notifications" className="relative">
                <Bell className="h-5 w-5 text-muted-foreground" />
                {(unread.data ?? 0) > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {unread.data}
                  </span>
                )}
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLogoutConfirmOpen(true)}
                className="font-display uppercase"
              >
                <LogOut /> <span className="hidden sm:inline">Exit</span>
              </Button>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6">
            {role.isLoading ? (
              <p className="text-sm text-muted-foreground">Checking your access...</p>
            ) : isAdmin ? (
              <Outlet />
            ) : (
              <div className="mx-auto max-w-md rounded-xl border border-destructive/40 bg-destructive/5 p-8 text-center">
                <h1 className="font-display text-xl uppercase">No admin access</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  This account is signed in but has no administrator role for the shop console.
                </p>
                <Button
                  className="mt-5 font-display uppercase"
                  variant="outline"
                  onClick={() => setLogoutConfirmOpen(true)}
                >
                  Exit
                </Button>
              </div>
            )}
          </main>
        </div>
        <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Log out of the admin console?</AlertDialogTitle>
              <AlertDialogDescription>
                You will need to enter your administrator credentials to access the console again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Stay signed in</AlertDialogCancel>
              <AlertDialogAction onClick={() => void signOut()}>Log out</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SidebarProvider>
  );
}
