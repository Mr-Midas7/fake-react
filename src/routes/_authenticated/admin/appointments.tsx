import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Archive } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import {
  APPOINTMENT_STATUSES,
  formatDateLong,
  formatPHP,
  formatTime,
  statusLabel,
  statusTone,
} from "@/lib/shop";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/appointments")({
  component: AppointmentsPage,
});

function AppointmentsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const [term, setTerm] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const appointments = useQuery({
    queryKey: ["admin-appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, appointment_services(service_name, price), crew_members(name)")
        .eq("is_archived", false)
        .order("appointment_date", { ascending: false })
        .order("start_time");
      if (error) throw error;
      return data;
    },
  });

  const crew = useQuery({
    queryKey: ["crew"],
    queryFn: async () => {
      const { data } = await supabase
        .from("crew_members")
        .select("*")
        .eq("is_active", true)
        .order("name");
      return Array.from(new Map((data ?? []).map((c) => [c.name.trim(), c])).values());
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("appointments")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Appointment updated");
      qc.invalidateQueries({ queryKey: ["admin-appointments"], exact: false });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"], exact: false });
      qc.invalidateQueries({ queryKey: ["archived-appointments"], exact: false });
    },
    onError: (err: Error) => {
      console.error("Update failed:", err);
      toast.error(`Update failed: ${err.message}`);
    },
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("appointments")
        .update({ is_archived: true } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Appointment archived");
      qc.invalidateQueries({ queryKey: ["admin-appointments"], exact: false });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"], exact: false });
      qc.invalidateQueries({ queryKey: ["archived-appointments"], exact: false });
    },
    onError: (err: Error) => {
      console.error("Archive failed:", err);
      toast.error(`Archive failed: ${err.message}`);
    },
  });

  const rows = (appointments.data ?? []).filter(
    (a) =>
      (status === "all" || a.status === status) &&
      (term.trim() === "" ||
        `${a.reference_code} ${a.customer_name} ${a.phone} ${a.plate_number}`
          .toLowerCase()
          .includes(term.toLowerCase())),
  );

  return (
    <div>
      <PageHeader
        title="Appointments Management"
        description="Confirm, reschedule, assign crew and archive bookings."
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search reference, name, phone or plate"
          className="max-w-xs"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {APPOINTMENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border/70 bg-card/60">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Motorcycle</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <Fragment key={a.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setOpenId(openId === a.id ? null : a.id)}
                  >
                    <TableCell className="font-mono text-xs">{a.reference_code}</TableCell>
                    <TableCell>
                      <span className="block text-sm">{a.customer_name}</span>
                      <span className="text-xs text-muted-foreground">{a.phone}</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {a.moto_brand} {a.moto_model} {a.moto_variant ?? ""} {a.moto_year ?? ""}
                      <span className="block text-muted-foreground">{a.plate_number}</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatDateLong(a.appointment_date)}
                      <span className="block text-muted-foreground">
                        {formatTime(String(a.start_time).slice(0, 5))}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-primary">
                      {formatPHP(a.total_estimate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("uppercase", statusTone(a.status))}>
                        {statusLabel(a.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          archive.mutate(a.id);
                        }}
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {openId === a.id && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-secondary/30">
                        <div className="grid gap-4 p-2 md:grid-cols-3">
                          <div>
                            <p className="text-xs tracking-widest text-muted-foreground uppercase">
                              Services
                            </p>
                            <ul className="mt-1 text-sm">
                              {(a.appointment_services ?? []).map((s) => (
                                <li key={s.service_name} className="flex justify-between gap-4">
                                  <span>{s.service_name}</span>
                                  <span className="text-primary">{formatPHP(s.price)}</span>
                                </li>
                              ))}
                            </ul>
                            {a.notes && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Customer notes: {a.notes}
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs tracking-widest text-muted-foreground uppercase">
                              Status
                            </p>
                            <Select
                              value={a.status}
                              onValueChange={(v) =>
                                update.mutate({ id: a.id, patch: { status: v } })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {APPOINTMENT_STATUSES.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {statusLabel(s)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs tracking-widest text-muted-foreground uppercase">
                              Assigned crew
                            </p>
                            <Select
                              value={a.assigned_crew_id ?? "none"}
                              onValueChange={(v) =>
                                update.mutate({
                                  id: a.id,
                                  patch: { assigned_crew_id: v === "none" ? null : v },
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Unassigned" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Unassigned</SelectItem>
                                {crew.data?.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <p className="text-xs tracking-widest text-muted-foreground uppercase">
                              Shop notes
                            </p>
                            <Input
                              defaultValue={a.admin_notes ?? ""}
                              placeholder="Internal remarks"
                              onBlur={(e) => {
                                if (e.target.value !== (a.admin_notes ?? ""))
                                  update.mutate({
                                    id: a.id,
                                    patch: { admin_notes: e.target.value },
                                  });
                              }}
                            />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">No appointments found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
