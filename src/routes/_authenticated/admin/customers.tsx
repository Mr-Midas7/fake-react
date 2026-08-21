import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Eye } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatDateLong, formatPHP, formatTime, statusLabel, statusTone } from "@/lib/shop";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const [term, setTerm] = useState("");
  const [historyCustomer, setHistoryCustomer] = useState<string | null>(null);

  const appts = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "customer_name,phone,email,moto_brand,moto_model,plate_number,appointment_date,total_estimate,status",
        )
        .order("appointment_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const customerHistory = useQuery({
    queryKey: ["customer-history", historyCustomer],
    queryFn: async () => {
      if (!historyCustomer) return [];
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id,customer_name,appointment_date,start_time,status,total_estimate,moto_brand,moto_model,plate_number,is_archived",
        )
        .eq("phone", historyCustomer)
        .order("appointment_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!historyCustomer,
  });

  const map = new Map<
    string,
    {
      name: string;
      phone: string;
      email: string | null;
      visits: number;
      spent: number;
      last: string;
      units: Set<string>;
    }
  >();
  for (const a of appts.data ?? []) {
    const c = map.get(a.phone) ?? {
      name: a.customer_name,
      phone: a.phone,
      email: a.email,
      visits: 0,
      spent: 0,
      last: a.appointment_date,
      units: new Set<string>(),
    };
    c.visits += 1;
    if (a.status === "completed") c.spent += Number(a.total_estimate);
    if (a.appointment_date > c.last) c.last = a.appointment_date;
    c.units.add(`${a.moto_brand} ${a.moto_model} (${a.plate_number})`);
    map.set(a.phone, c);
  }

  const rows = [...map.values()].filter(
    (c) => term.trim() === "" || `${c.name} ${c.phone}`.toLowerCase().includes(term.toLowerCase()),
  );

  return (
    <div>
      <PageHeader title="Customer List" description="Everyone who has booked with the shop." />
      <Input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search name or number"
        className="mb-4 max-w-xs"
      />
      <Card className="border-border/70 bg-card/60">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Units</TableHead>
                <TableHead>Visits</TableHead>
                <TableHead>Completed spend</TableHead>
                <TableHead>Last booking</TableHead>
                <TableHead className="text-right">History</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.phone}>
                  <TableCell className="text-sm">{c.name}</TableCell>
                  <TableCell className="text-xs">
                    {c.phone}
                    {c.email && <span className="block text-muted-foreground">{c.email}</span>}
                  </TableCell>
                  <TableCell className="text-xs">{[...c.units].join(", ")}</TableCell>
                  <TableCell className="text-sm">{c.visits}</TableCell>
                  <TableCell className="text-sm text-primary">{formatPHP(c.spent)}</TableCell>
                  <TableCell className="text-xs">{formatDateLong(c.last)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setHistoryCustomer(c.phone)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">No customers yet.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!historyCustomer} onOpenChange={(open) => !open && setHistoryCustomer(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display uppercase">Appointment History</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {customerHistory.data?.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-border/50 p-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="font-medium">{formatDateLong(a.appointment_date)}</span>
                    {a.start_time && (
                      <span className="ml-2 text-muted-foreground">
                        {formatTime(String(a.start_time).slice(0, 5))}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">
                    {a.moto_brand} {a.moto_model}
                  </span>
                  {a.is_archived && (
                    <Badge variant="outline" className="text-[10px] uppercase">
                      Archived
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] uppercase", statusTone(a.status))}
                  >
                    {statusLabel(a.status)}
                  </Badge>
                  <span className="text-sm text-primary">{formatPHP(a.total_estimate)}</span>
                </div>
              </div>
            ))}
            {customerHistory.data?.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {customerHistory.isLoading ? "Loading..." : "No appointments found."}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
