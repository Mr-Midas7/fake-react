import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { ActiveFilterChips } from "@/components/admin/active-filter-chips";
import { PaginationControls } from "@/components/admin/pagination-controls";
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
import { Badge } from "@/components/ui/badge";
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
import { recordAdminActivityEvent } from "@/lib/admin-activity";
import {
  formatBusinessTimestamp,
  getShopLogoDataUrl,
  SHOP_EXPORT_NAME,
  SHOP_OWNER_NAME,
} from "@/lib/export-branding";
import { addDays, formatDateLong, formatPHP, manilaNow, statusLabel } from "@/lib/shop";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  component: ReportsPage,
});

const reportOptions = [
  { value: "bookings", label: "Booking volume" },
  { value: "services", label: "Service activity" },
] as const;

const periodOptions = [
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom dates" },
] as const;

const statusOptions = ["pending", "confirmed", "in_progress", "completed", "cancelled", "no_show"];

type ReportKind = (typeof reportOptions)[number]["value"];
type PeriodPreset = (typeof periodOptions)[number]["value"];
type ExportType = "csv" | "pdf";

type CatalogService = { id: string; name: string; category: string };
type BookingRow = {
  id: string;
  reference_code: string;
  customer_name: string;
  appointment_date: string;
  status: string;
  total_estimate: number | string;
};
type ServiceRow = {
  appointment_id: string;
  service_id: string | null;
  service_name: string;
  price: number | string;
  reference_code: string;
  customer_name: string;
  appointment_date: string;
  status: string;
  category: string;
};
type ReportMetrics = {
  total_bookings: number;
  completed_bookings?: number;
  completed_rows?: number;
  completed_value: number | string;
  status_counts: Record<string, number>;
};
type ReportPage = { rows: Array<BookingRow | ServiceRow>; total: number; metrics: ReportMetrics };
type ExportData = { headers: string[]; rows: string[][]; summary: string[] };

function ReportsPage() {
  const pageSize = 25;
  const today = manilaNow().date;
  const initialRange = periodRange("this_month", today);
  const [reportKind, setReportKind] = useState<ReportKind>("bookings");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("this_month");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [category, setCategory] = useState("all");
  const [serviceName, setServiceName] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [pendingExport, setPendingExport] = useState<ExportType | null>(null);

  const catalog = useQuery({
    queryKey: ["report-service-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id,name,category")
        .order("category")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CatalogService[];
    },
  });

  const data = useQuery({
    queryKey: ["reports", { reportKind, from, to, status, category, serviceName, page }],
    queryFn: () =>
      getReportPage({
        reportKind,
        from,
        to,
        status,
        category,
        serviceName,
        limit: pageSize,
        offset: page * pageSize,
      }),
  });

  useEffect(() => {
    setPage(0);
  }, [reportKind, from, to, status, category, serviceName]);

  const categories = useMemo(
    () =>
      Array.from(new Set((catalog.data ?? []).map((item) => item.category).filter(Boolean))).sort(),
    [catalog.data],
  );
  const serviceOptions = useMemo(
    () =>
      (catalog.data ?? [])
        .filter((item) => category === "all" || item.category === category)
        .sort((first, second) => first.name.localeCompare(second.name)),
    [catalog.data, category],
  );
  const metrics = data.data?.metrics;
  const byStatus = Object.entries(metrics?.status_counts ?? {}).sort(([first], [second]) =>
    first.localeCompare(second),
  );
  const preview = makeExportData(reportKind, data.data?.rows ?? [], metrics);
  const reportTitle =
    reportKind === "bookings"
      ? "Booking Volume Report"
      : `${serviceName !== "all" ? serviceName : category !== "all" ? category : "All Services"} Activity Report`;
  const reportScope = [
    `${formatDateLong(from)} to ${formatDateLong(to)}`,
    status === "all" ? "All booking statuses" : statusLabel(status),
    category === "all" ? "All categories" : category,
    serviceName === "all" ? null : serviceName,
  ]
    .filter(Boolean)
    .join(" · ");

  function updatePeriod(value: PeriodPreset) {
    setPeriodPreset(value);
    if (value === "custom") return;
    const range = periodRange(value, today);
    setFrom(range.from);
    setTo(range.to);
  }

  const activeFilters = [
    ...(reportKind !== "bookings"
      ? [{ label: "Report", value: "Service activity", onClear: () => setReportKind("bookings") }]
      : []),
    ...(periodPreset === "custom"
      ? [
          {
            label: "Period",
            value: `${formatDateLong(from)} to ${formatDateLong(to)}`,
            onClear: () => updatePeriod("this_month"),
          },
        ]
      : []),
    ...(category !== "all"
      ? [{ label: "Category", value: category, onClear: () => setCategory("all") }]
      : []),
    ...(serviceName !== "all"
      ? [{ label: "Service", value: serviceName, onClear: () => setServiceName("all") }]
      : []),
    ...(status !== "all"
      ? [{ label: "Status", value: statusLabel(status), onClear: () => setStatus("all") }]
      : []),
  ];

  function resetFilters() {
    setReportKind("bookings");
    setPeriodPreset("this_month");
    setFrom(initialRange.from);
    setTo(initialRange.to);
    setCategory("all");
    setServiceName("all");
    setStatus("all");
    setPage(0);
  }

  async function confirmExport() {
    if (!pendingExport) return;
    try {
      const allRows = await getAllReportRows({
        reportKind,
        from,
        to,
        status,
        category,
        serviceName,
      });
      const exportData = makeExportData(reportKind, allRows.rows, allRows.metrics);
      if (pendingExport === "csv") exportCsv(exportData, reportKind, from, to);
      if (pendingExport === "pdf")
        await exportPdf(exportData, reportKind, reportTitle, reportScope, from, to);
      await recordAdminActivityEvent({
        action: "exported",
        resourceType: "Reports",
        targetLabel: reportTitle,
        summary: `Exported ${allRows.total} ${reportKind === "services" ? "service entries" : "bookings"} as ${pendingExport.toUpperCase()}.`,
        changedFields: ["report_type", "date_range", "export_format"],
      });
      toast.success("Report exported.");
    } catch {
      toast.error("Could not create this report export. Please try again.");
    } finally {
      setPendingExport(null);
    }
  }

  const rowLabel = reportKind === "services" ? "service entries" : "bookings";

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Build booking-volume or service-activity reports for a selected period."
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!data.data?.total} className="uppercase">
                <Download /> Export selected report
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setPendingExport("csv")}>
                <Download className="mr-2 h-4 w-4" /> Export CSV table
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPendingExport("pdf")}>
                <FileText className="mr-2 h-4 w-4" /> Export PDF table
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <Card className="mb-6 border-border/70 bg-card/60">
        <CardContent className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          <FilterSelect
            label="Report"
            value={reportKind}
            onValueChange={(value) => setReportKind(value as ReportKind)}
            options={reportOptions}
          />
          <FilterSelect
            label="Period"
            value={periodPreset}
            onValueChange={(value) => updatePeriod(value as PeriodPreset)}
            options={periodOptions}
          />
          <FilterSelect
            label="Service category"
            value={category}
            onValueChange={(value) => {
              setCategory(value);
              setServiceName("all");
            }}
            options={[
              { value: "all", label: "All categories" },
              ...categories.map((value) => ({ value, label: value })),
            ]}
          />
          <FilterSelect
            label="Booking status"
            value={status}
            onValueChange={setStatus}
            options={[
              { value: "all", label: "All statuses" },
              ...statusOptions.map((value) => ({ value, label: statusLabel(value) })),
            ]}
          />
          <div className="space-y-1.5 xl:col-span-2">
            <Label>Specific service</Label>
            <Select value={serviceName} onValueChange={setServiceName}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services</SelectItem>
                {serviceOptions.map((item) => (
                  <SelectItem key={item.id} value={item.name}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {periodPreset === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="report-from">From</Label>
                <Input
                  id="report-from"
                  type="date"
                  value={from}
                  max={to}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-to">To</Label>
                <Input
                  id="report-to"
                  type="date"
                  value={to}
                  min={from}
                  onChange={(event) => setTo(event.target.value)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <ActiveFilterChips filters={activeFilters} onReset={resetFilters} />

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{reportTitle}</Badge>
        <span>{reportScope}</span>
      </div>
      {reportKind === "bookings" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total bookings" value={String(metrics?.total_bookings ?? 0)} />
          <Stat label="Completed jobs" value={String(metrics?.completed_bookings ?? 0)} />
          <Stat label="Completed revenue" value={formatPHP(metrics?.completed_value ?? 0)} />
          <Stat label="Status groups" value={String(byStatus.length)} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Service entries" value={String(data.data?.total ?? 0)} />
          <Stat label="Bookings served" value={String(metrics?.total_bookings ?? 0)} />
          <Stat label="Completed entries" value={String(metrics?.completed_rows ?? 0)} />
          <Stat label="Completed service value" value={formatPHP(metrics?.completed_value ?? 0)} />
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        <Card className="border-border/70 bg-card/60">
          <CardContent className="p-5">
            <h2 className="font-display text-sm tracking-widest uppercase">Status breakdown</h2>
            {byStatus.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Nothing to report for this selection.
              </p>
            ) : (
              <ul className="mt-4 space-y-2 text-sm">
                {byStatus.map(([item, count]) => (
                  <li key={item} className="flex justify-between border-b border-border/50 pb-2">
                    <span>{statusLabel(item)}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardContent className="overflow-x-auto p-0">
            <div className="border-b border-border px-5 py-3 text-sm text-muted-foreground">
              Preview: {preview.rows.length} of {data.data?.total ?? 0} {rowLabel}
            </div>
            <Table className="admin-data-table">
              <TableHeader>
                <TableRow>
                  {preview.headers.map((header) => (
                    <TableHead key={header}>{header}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((row, index) => (
                  <TableRow key={`${row[0]}-${row[4] ?? ""}-${index}`}>
                    {row.map((cell, cellIndex) => (
                      <TableCell
                        key={`${cellIndex}-${cell}`}
                        data-label={preview.headers[cellIndex]}
                        className="whitespace-nowrap text-sm"
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {!data.isLoading && preview.rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={preview.headers.length}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No {rowLabel} match this report selection.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {data.isLoading && (
              <p className="p-8 text-center text-sm text-muted-foreground">Loading report…</p>
            )}
            {data.isError && (
              <p className="p-8 text-center text-sm text-destructive">
                Could not load this report. Please try again.
              </p>
            )}
            <PaginationControls
              page={page}
              pageSize={pageSize}
              total={data.data?.total ?? 0}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={pendingExport !== null}
        onOpenChange={(open) => !open && setPendingExport(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm report export</AlertDialogTitle>
            <AlertDialogDescription>
              Export the selected {reportTitle.toLowerCase()} with all {data.data?.total ?? 0}{" "}
              {rowLabel} as a {pendingExport?.toUpperCase()} table?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmExport}>
              Export {pendingExport?.toUpperCase()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

async function getReportPage(input: {
  reportKind: ReportKind;
  from: string;
  to: string;
  status: string;
  category: string;
  serviceName: string;
  limit: number;
  offset: number;
}) {
  const { data, error } = await supabase.rpc("get_admin_report_page", {
    p_report_kind: input.reportKind,
    p_from: input.from,
    p_to: input.to,
    p_status: input.status === "all" ? null : input.status,
    p_category: input.category === "all" ? null : input.category,
    p_service_name: input.serviceName === "all" ? null : input.serviceName,
    p_limit: input.limit,
    p_offset: input.offset,
  });
  if (error) throw error;
  return data as unknown as ReportPage;
}

async function getAllReportRows(
  input: Omit<Parameters<typeof getReportPage>[0], "limit" | "offset">,
) {
  const limit = 250;
  let offset = 0;
  let first: ReportPage | null = null;
  let rows: Array<BookingRow | ServiceRow> = [];
  do {
    const current = await getReportPage({ ...input, limit, offset });
    first ??= current;
    rows = rows.concat(current.rows);
    offset += current.rows.length;
  } while (first && offset < first.total);
  return { rows, total: first?.total ?? 0, metrics: first?.metrics };
}

function makeExportData(
  reportKind: ReportKind,
  rows: Array<BookingRow | ServiceRow>,
  metrics?: ReportMetrics,
): ExportData {
  if (reportKind === "services") {
    const serviceRows = rows as ServiceRow[];
    return {
      headers: ["Reference", "Customer", "Date", "Status", "Service", "Category", "Value"],
      rows: serviceRows.map((row) => [
        row.reference_code,
        row.customer_name,
        formatDateLong(row.appointment_date),
        statusLabel(row.status),
        row.service_name,
        row.category,
        `PHP ${Number(row.price).toFixed(2)}`,
      ]),
      summary: [
        `Service entries: ${serviceRows.length}`,
        `Bookings served: ${metrics?.total_bookings ?? 0}`,
        `Completed service entries: ${metrics?.completed_rows ?? 0}`,
        `Completed service value: PHP ${Number(metrics?.completed_value ?? 0).toFixed(2)}`,
      ],
    };
  }
  const bookingRows = rows as BookingRow[];
  const statusText =
    Object.entries(metrics?.status_counts ?? {})
      .map(([name, count]) => `${statusLabel(name)} ${count}`)
      .join(", ") || "None";
  return {
    headers: ["Reference", "Customer", "Date", "Status", "Estimate"],
    rows: bookingRows.map((row) => [
      row.reference_code,
      row.customer_name,
      formatDateLong(row.appointment_date),
      statusLabel(row.status),
      `PHP ${Number(row.total_estimate).toFixed(2)}`,
    ]),
    summary: [
      `Total bookings: ${metrics?.total_bookings ?? 0}`,
      `Completed jobs: ${metrics?.completed_bookings ?? 0}`,
      `Completed revenue: PHP ${Number(metrics?.completed_value ?? 0).toFixed(2)}`,
      `Statuses: ${statusText}`,
    ],
  };
}

function periodRange(preset: Exclude<PeriodPreset, "custom">, today: string) {
  if (preset === "this_week") {
    const day = new Date(`${today}T00:00:00`).getDay();
    return { from: addDays(today, -((day + 6) % 7)), to: today };
  }
  if (preset === "this_year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: `${today.slice(0, 8)}01`, to: today };
}

function exportCsv(data: ExportData, reportKind: ReportKind, from: string, to: string) {
  const lines = data.rows.map((row) =>
    row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","),
  );
  downloadBlob(
    [data.headers.join(","), ...lines].join("\n"),
    `fake-rider-${fileName(reportKind)}-${from}-to-${to}.csv`,
    "text/csv;charset=utf-8;",
  );
}

async function exportPdf(
  data: ExportData,
  reportKind: ReportKind,
  title: string,
  scope: string,
  from: string,
  to: string,
) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: reportKind === "services" ? "landscape" : "portrait" });
  const logo = await getShopLogoDataUrl();
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFontSize(16);
  const logoSize = 24;
  const gap = 6;
  const startX = (pageWidth - logoSize - gap - doc.getTextWidth(SHOP_EXPORT_NAME)) / 2;
  doc.addImage(logo, "PNG", startX, 10, logoSize, logoSize);
  doc.text(SHOP_EXPORT_NAME, startX + logoSize + gap, 26);
  doc.setFontSize(11);
  doc.text(title.toUpperCase(), 14, 54);
  doc.setFontSize(9);
  doc.text(`Generated: ${formatBusinessTimestamp()}`, 14, 60);
  const scopeLines = doc.splitTextToSize(`Scope: ${scope}`, pageWidth - 28);
  doc.text(scopeLines, 14, 66);
  const summaryY = 66 + scopeLines.length * 5 + 4;
  doc.setFontSize(10);
  data.summary.forEach((line, index) => doc.text(line, 14, summaryY + index * 6));
  autoTable(doc, {
    startY: summaryY + data.summary.length * 6 + 4,
    head: [data.headers],
    body: data.rows,
    theme: "grid",
    margin: { bottom: 48 },
    styles: { fontSize: 8 },
    headStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0] },
  });
  const pageHeight = doc.internal.pageSize.getHeight();
  const signatureY = pageHeight - 29;
  doc.setPage(doc.getNumberOfPages());
  doc.setDrawColor(80);
  doc.line(pageWidth - 78, signatureY, pageWidth - 14, signatureY);
  doc.setFontSize(10);
  doc.text(SHOP_OWNER_NAME, pageWidth - 46, signatureY + 6, { align: "center" });
  doc.setFontSize(8);
  doc.text("Shop Owner", pageWidth - 46, signatureY + 11, { align: "center" });
  doc.text("Signature over printed name", pageWidth - 46, signatureY - 3, { align: "center" });
  doc.save(`fake-rider-${fileName(reportKind)}-${from}-to-${to}.pdf`);
}

function downloadBlob(contents: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
function fileName(reportKind: ReportKind) {
  return reportKind === "services" ? "service-activity-report" : "booking-volume-report";
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/70 bg-card/60">
      <CardContent className="p-5">
        <p className="text-xs tracking-wider text-muted-foreground uppercase">{label}</p>
        <p className="mt-2 font-display text-2xl text-primary">{value}</p>
      </CardContent>
    </Card>
  );
}
