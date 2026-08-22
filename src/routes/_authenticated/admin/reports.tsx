import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { addDays, formatDateLong, formatPHP, manilaNow, statusLabel } from "@/lib/shop";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const today = manilaNow().date;
  const [from, setFrom] = useState(addDays(today, -30));
  const [to, setTo] = useState(today);

  const data = useQuery({
    queryKey: ["reports", from, to],
    queryFn: async () => {
      const { data: appts, error } = await supabase
        .from("appointments")
        .select("id,reference_code,customer_name,appointment_date,status,total_estimate")
        .neq("is_archived", true)
        .gte("appointment_date", from)
        .lte("appointment_date", to)
        .order("appointment_date");
      if (error) throw error;

      const ids = (appts ?? []).map((a) => a.id);
      let services: { appointment_id: string; service_name: string; price: number }[] = [];
      if (ids.length > 0) {
        const res = await supabase
          .from("appointment_services")
          .select("appointment_id,service_name,price")
          .in("appointment_id", ids);
        if (res.error) throw res.error;
        services = (res.data ?? []) as typeof services;
      }
      return { appts: appts ?? [], services };
    },
  });

  const appts = data.data?.appts ?? [];
  const services = data.data?.services ?? [];

  const byStatus = new Map<string, number>();
  for (const a of appts) byStatus.set(a.status, (byStatus.get(a.status) ?? 0) + 1);

  const completed = appts.filter((a) => a.status === "completed");
  const revenue = completed.reduce((s, a) => s + Number(a.total_estimate), 0);
  const pipeline = appts
    .filter((a) => ["pending", "confirmed", "in_progress"].includes(a.status))
    .reduce((s, a) => s + Number(a.total_estimate), 0);

  const activeApptIds = new Set(
    appts.filter((a) => !["cancelled", "no_show"].includes(a.status)).map((a) => a.id),
  );

  const topServices = [
    ...services
      .filter((s) => activeApptIds.has(s.appointment_id))
      .reduce((map, s) => {
        const cur = map.get(s.service_name) ?? { count: 0, value: 0 };
        cur.count += 1;
        cur.value += Number(s.price);
        map.set(s.service_name, cur);
        return map;
      }, new Map<string, { count: number; value: number }>())
      .entries(),
  ]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  const byMonth = [
    ...appts
      .reduce((map, a) => {
        const key = a.appointment_date.slice(0, 7);
        map.set(key, (map.get(key) ?? 0) + 1);
        return map;
      }, new Map<string, number>())
      .entries(),
  ].sort((a, b) => a[0].localeCompare(b[0]));
  const peak = Math.max(1, ...byMonth.map(([, n]) => n));

  function exportCsv() {
    const header = ["Reference", "Customer", "Date", "Status", "Estimate"];
    const lines = appts.map((a) =>
      [
        a.reference_code,
        a.customer_name,
        a.appointment_date,
        statusLabel(a.status),
        Number(a.total_estimate).toFixed(2),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `fake-rider-report-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("Fake Rider Motorparts - Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`Period: ${formatDateLong(from)} to ${formatDateLong(to)}`, 14, 28);

    let y = 38;
    doc.setFontSize(10);
    doc.text(`Total bookings: ${appts.length}`, 14, y);
    doc.text(`Completed jobs: ${completed.length}`, 60, y);
    doc.text(`Completed revenue: ${formatPHP(revenue).replace(/₱\s*/, "PHP ")}`, 110, y);
    doc.text(`Pipeline estimate: ${formatPHP(pipeline).replace(/₱\s*/, "PHP ")}`, 170, y);
    y += 10;

    const tableData = appts.map((a) => [
      a.reference_code,
      a.customer_name,
      formatDateLong(a.appointment_date),
      statusLabel(a.status),
      `PHP ${Number(a.total_estimate).toFixed(2)}`,
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Reference", "Customer", "Date", "Status", "Estimate"]],
      body: tableData,
      theme: "grid",
      styles: { fontSize: 8 },
      headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0] },
    });

    doc.save(`fake-rider-report-${from}-to-${to}.pdf`);
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Bookings, top services and revenue estimates for the selected period."
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={appts.length === 0} className="uppercase">
                <Download /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCsv}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportPdf}>
                <FileText className="mr-2 h-4 w-4" />
                Export PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="mb-6 flex flex-wrap gap-4">
        <div className="space-y-1.5">
          <Label>From</Label>
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full sm:w-44"
          />
        </div>
        <div className="space-y-1.5">
          <Label>To</Label>
          <Input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="w-full sm:w-44"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total bookings" value={String(appts.length)} />
        <Stat label="Completed jobs" value={String(completed.length)} />
        <Stat label="Completed revenue" value={formatPHP(revenue)} />
        <Stat label="Pipeline estimate" value={formatPHP(pipeline)} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="border-border/70 bg-card/60">
          <CardContent className="p-5">
            <h2 className="font-display text-sm tracking-widest uppercase">Bookings per month</h2>
            {byMonth.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No bookings in this period.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {byMonth.map(([month, count]) => (
                  <li key={month}>
                    <div className="flex justify-between text-xs text-muted-foreground uppercase">
                      <span>{month}</span>
                      <span>{count}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-secondary/60">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${(count / peak) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/60">
          <CardContent className="p-5">
            <h2 className="font-display text-sm tracking-widest uppercase">Status breakdown</h2>
            {byStatus.size === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">Nothing to report yet.</p>
            ) : (
              <ul className="mt-4 space-y-2 text-sm">
                {[...byStatus.entries()].map(([status, count]) => (
                  <li key={status} className="flex justify-between border-b border-border/50 pb-2">
                    <span>{statusLabel(status)}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 border-border/70 bg-card/60">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Top services</TableHead>
                <TableHead>Times booked</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topServices.map(([name, s]) => (
                <TableRow key={name}>
                  <TableCell className="text-sm">{name}</TableCell>
                  <TableCell className="text-sm">{s.count}</TableCell>
                  <TableCell className="text-sm">{formatPHP(s.value)}</TableCell>
                </TableRow>
              ))}
              {topServices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                    No services booked between {formatDateLong(from)} and {formatDateLong(to)}.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/70 bg-card/60">
      <CardContent className="p-5">
        <p className="text-xs tracking-widest text-muted-foreground uppercase">{label}</p>
        <p className="mt-1 font-display text-2xl">{value}</p>
      </CardContent>
    </Card>
  );
}
