import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BellRing, CheckCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
  }

  const markOne = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All notifications marked as read.");
      refresh();
    },
    onError: () => toast.error("Could not update notifications."),
  });

  const deleteNotification = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notification removed.");
      refresh();
    },
    onError: (err: Error) => {
      console.error("Delete notification failed:", err);
      toast.error(`Could not remove notification: ${err.message}`);
    },
  });

  const rows = list.data ?? [];
  const unread = rows.filter((n) => !n.is_read).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="New bookings and cancellations, newest first."
        action={
          <Button
            variant="outline"
            className="uppercase"
            disabled={unread === 0}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck /> Mark all read
          </Button>
        }
      />

      <div className="space-y-3">
        {rows.map((n) => (
          <Card
            key={n.id}
            className={cn(
              "border-border/70 bg-card/60",
              !n.is_read && "border-primary/50 bg-primary/5",
            )}
          >
            <CardContent className="flex flex-wrap items-start gap-4 p-4">
              <BellRing
                className={cn(
                  "mt-0.5 h-5 w-5",
                  n.is_read ? "text-muted-foreground" : "text-primary",
                )}
              />
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">{n.title}</p>
                {n.message && <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>}
                <p className="mt-1 text-[11px] tracking-wider text-muted-foreground uppercase">
                  {new Date(n.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/appointments">View appointments</Link>
                </Button>
                {!n.is_read && (
                  <Button size="sm" variant="ghost" onClick={() => markOne.mutate(n.id)}>
                    Mark read
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteNotification.mutate(n.id)}
                  title="Remove notification"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && (
          <Card className="border-border/70 bg-card/60">
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              {list.isLoading ? "Loading notifications..." : "No notifications yet."}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
