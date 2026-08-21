import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, CalendarClock, PhilippinePeso, Users } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  formatDateLong,
  formatPHP,
  formatTime,
  manilaNow,
  statusLabel,
  statusTone,
} from "@/lib/shop";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard,
});

function Dashboard() {
  const today = manilaNow().date;

  const data = useQuery({
    queryKey: ["admin-dashboard", today],
    queryFn: async () => {
      const { data: appts, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("is_archived", false)
        .order("appointment_date")
        .order("start_time");
      if (error) throw error;
      return appts;
    },
  });

  const list = data.data ?? [];
  const active = list.filter((a) => !["cancelled", "no_show"].includes(a.status));
  const todays = active.filter((a) => a.appointment_date === today);
  const upcoming = active.filter((a) => a.appointment_date > today).slice(0, 8);
  const pending = active.filter((a) => a.status === "pending");
  const revenue = list
    .filter((a) => a.status === "completed")
    .reduce((sum, a) => sum + Number(a.total_estimate), 0);
  const customers = new Set(list.map((a) => a.phone)).size;

  return (
    <div>
      <PageHeader title="Dashboard" description={`Shop overview for ${formatDateLong(today)}`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<CalendarCheck className="h-5 w-5 text-primary" />}
          label="Today's appointments"
          value={String(todays.length)}
        />
        <Stat
          icon={<CalendarClock className="h-5 w-5 text-accent" />}
          label="Pending approval"
          value={String(pending.length)}
        />
        <Stat
          icon={<Users className="h-5 w-5 text-primary" />}
          label="Unique customers"
          value={String(customers)}
        />
        <Stat
          icon={<PhilippinePeso className="h-5 w-5 text-emerald-400" />}
          label="Completed revenue"
          value={formatPHP(revenue)}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Today's schedule"
          empty="No appointments scheduled for today."
          rows={todays}
        />
        <Panel title="Upcoming" empty="No upcoming appointments yet." rows={upcoming} />
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Manage everything in{" "}
        <Link to="/admin/appointments" className="text-primary hover:underline">
          Appointments Management
        </Link>
        .
      </p>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="border-border/70 bg-card/60">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-lg bg-secondary/60 p-3">{icon}</div>
        <div>
          <p className="text-xs tracking-widest text-muted-foreground uppercase">{label}</p>
          <p className="font-display text-2xl">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

type Row = {
  id: string;
  reference_code: string;
  customer_name: string;
  appointment_date: string;
  start_time: string;
  status: string;
  moto_brand: string;
  moto_model: string;
};

function Panel({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  return (
    <Card className="border-border/70 bg-card/60">
      <CardContent className="p-5">
        <h2 className="font-display mb-4 text-lg tracking-wide uppercase">{title}</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 border-b border-border/50 pb-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {a.customer_name} &middot;{" "}
                    <span className="text-muted-foreground">{a.reference_code}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateLong(a.appointment_date)} at{" "}
                    {formatTime(String(a.start_time).slice(0, 5))} &middot; {a.moto_brand}{" "}
                    {a.moto_model}
                  </p>
                </div>
                <Badge variant="outline" className={cn("uppercase", statusTone(a.status))}>
                  {statusLabel(a.status)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
