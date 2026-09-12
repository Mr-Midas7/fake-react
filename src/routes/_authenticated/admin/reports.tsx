import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileText,
  Filter,
  ListFilter,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import exportLogoUrl from "@/assets/export-logo.png";
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
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
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
import { addDays, formatDateLong, formatPHP, manilaNow, statusLabel, statusTone } from "@/lib/shop";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  component: ReportsPage,
});

const periodOptions = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom dates" },
] as const;

const statusOptions = [
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "rescheduled",
  "cancelled",
  "rejected",
  "no_show",
];

type ReportKind = "bookings" | "services";
type PeriodPreset = (typeof periodOptions)[number]["value"];
type ExportType = "pdf" | "docx";
type ReportFilters = {
  periodPreset: PeriodPreset;
  from: string;
  to: string;
  category: string;
  serviceName: string;
  status: string;
};

type CatalogService = { id: string; name: string; category: string };
type BookingRow = {
  id: string;
  reference_code: string;
  customer_name: string;
  appointment_date: string;
  service: string;
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
type Trend = {
  direction: "up" | "down" | "flat";
  label: string;
  description: string;
};

function ReportsPage() {
  const pageSize = 10;
  const today = manilaNow().date;
  const initialFilters = getInitialFilters(today);
  const [draftFilters, setDraftFilters] = useState<ReportFilters>(initialFilters);
  const [filters, setFilters] = useState<ReportFilters>(initialFilters);
  const [page, setPage] = useState(0);
  const [pendingExport, setPendingExport] = useState<ExportType | null>(null);
  const reportKind: ReportKind = "bookings";
  const { from, to, status, category, serviceName } = filters;
  const previousRange = useMemo(() => previousPeriodRange(from, to), [from, to]);
  const customDateError =
    draftFilters.periodPreset === "custom" && (!draftFilters.from || !draftFilters.to)
      ? "Select both a start and end date."
      : draftFilters.from > draftFilters.to
        ? "The end date must be on or after the start date."
        : undefined;

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

  const comparison = useQuery({
    queryKey: ["reports-comparison", { reportKind, previousRange, status, category, serviceName }],
    queryFn: () =>
      getReportPage({
        reportKind,
        from: previousRange.from,
        to: previousRange.to,
        status,
        category,
        serviceName,
        limit: 1,
        offset: 0,
      }),
  });

  const categories = useMemo(
    () =>
      Array.from(new Set((catalog.data ?? []).map((item) => item.category).filter(Boolean))).sort(),
    [catalog.data],
  );
  const serviceOptions = useMemo(
    () =>
      (catalog.data ?? [])
        .filter(
          (item) => draftFilters.category === "all" || item.category === draftFilters.category,
        )
        .sort((first, second) => first.name.localeCompare(second.name)),
    [catalog.data, draftFilters.category],
  );
  const metrics = data.data?.metrics;
  const comparisonMetrics = comparison.data?.metrics;
  const byStatus = Object.entries(metrics?.status_counts ?? {}).sort(([first], [second]) =>
    first.localeCompare(second),
  );
  const statusTotal = Math.max(
    1,
    byStatus.reduce((total, [, count]) => total + count, 0),
  );
  const comparisonStatusGroups = comparisonMetrics
    ? Object.keys(comparisonMetrics.status_counts ?? {}).length
    : undefined;
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
    setDraftFilters((current) => {
      if (value === "custom") return { ...current, periodPreset: value };
      const range = periodRange(value, today);
      return { ...current, periodPreset: value, ...range };
    });
  }

  function applyFilters() {
    if (customDateError) return;
    setFilters({ ...draftFilters });
    setPage(0);
  }

  function resetFilters() {
    const nextFilters = getInitialFilters(today);
    setDraftFilters(nextFilters);
    setFilters(nextFilters);
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
      if (pendingExport === "pdf")
        await exportPdf(exportData, reportKind, reportTitle, reportScope, from, to);
      if (pendingExport === "docx")
        await exportDocx(exportData, reportKind, reportTitle, reportScope, from, to);
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

  const rowLabel = "bookings";

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <BarChart3 className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-2xl tracking-wide uppercase md:text-3xl">Reports</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              View booking volume and service activity for a selected period.
            </p>
          </div>
        </div>
        <div className="w-full sm:w-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={!data.data?.total}
                className="w-full uppercase sm:w-auto"
              >
                <Download /> Export selected report
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setPendingExport("pdf")}>
                <FileText className="mr-2 h-4 w-4" /> Export PDF table
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPendingExport("docx")}>
                <FileText className="mr-2 h-4 w-4" /> Export DOCX document
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Card className="mb-5 border-border/70 bg-card/60">
        <CardContent className="p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Filter className="size-4 text-primary" aria-hidden="true" />
            <h2 className="font-display text-base tracking-wide uppercase">Filters</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)_auto] lg:items-end">
            <FilterSelect
              label="Service category"
              value={draftFilters.category}
              onValueChange={(value) => {
                setDraftFilters((current) => ({
                  ...current,
                  category: value,
                  serviceName: "all",
                }));
              }}
              options={[
                { value: "all", label: "All categories" },
                ...categories.map((value) => ({ value, label: value })),
              ]}
            />
            <div className="min-w-0 space-y-1.5">
              <Label>Service</Label>
              <Select
                value={draftFilters.serviceName}
                onValueChange={(value) =>
                  setDraftFilters((current) => ({ ...current, serviceName: value }))
                }
              >
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
            <FilterSelect
              label="Booking status"
              value={draftFilters.status}
              onValueChange={(value) =>
                setDraftFilters((current) => ({ ...current, status: value }))
              }
              options={[
                { value: "all", label: "All statuses" },
                ...statusOptions.map((value) => ({ value, label: statusLabel(value) })),
              ]}
            />
            <div className="min-w-0 space-y-1.5">
              <Label>Period</Label>
              <PeriodPicker
                value={draftFilters.periodPreset}
                from={draftFilters.from}
                to={draftFilters.to}
                error={customDateError}
                onValueChange={updatePeriod}
                onRangeChange={(range) =>
                  setDraftFilters((current) => ({
                    ...current,
                    periodPreset: "custom",
                    ...range,
                  }))
                }
              />
            </div>
            <div className="flex gap-2 md:col-span-2 lg:col-span-1 lg:self-end">
              <Button
                type="button"
                className="flex-1 whitespace-nowrap lg:flex-none"
                onClick={applyFilters}
                disabled={Boolean(customDateError)}
              >
                <Filter /> Apply filters
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 whitespace-nowrap lg:flex-none"
                onClick={resetFilters}
              >
                <RotateCcw /> Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-5 border-border/70 bg-card/60">
        <CardContent className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <CalendarDays className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-sm tracking-wide uppercase">{reportTitle}</h2>
            <p className="truncate text-sm text-muted-foreground">{formatDateRange(from, to)}</p>
          </div>
        </CardContent>
      </Card>

      {reportKind === "bookings" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Total bookings"
            value={String(metrics?.total_bookings ?? 0)}
            icon={CalendarDays}
            iconClassName="bg-chart-4/15 text-chart-4"
            trend={makeTrend(metrics?.total_bookings, comparisonMetrics?.total_bookings)}
          />
          <Stat
            label="Completed jobs"
            value={String(metrics?.completed_bookings ?? 0)}
            icon={CheckCircle2}
            iconClassName="bg-emerald-500/15 text-emerald-400"
            trend={makeTrend(metrics?.completed_bookings, comparisonMetrics?.completed_bookings)}
          />
          <Stat
            label="Completed revenue"
            value={formatPHP(metrics?.completed_value ?? 0)}
            icon={CircleDollarSign}
            iconClassName="bg-accent/15 text-accent"
            trend={makeTrend(metrics?.completed_value, comparisonMetrics?.completed_value)}
          />
          <Stat
            label="Status groups"
            value={String(byStatus.length)}
            icon={BarChart3}
            iconClassName="bg-chart-4/15 text-chart-4"
            trend={makeTrend(byStatus.length, comparisonStatusGroups)}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Service entries"
            value={String(data.data?.total ?? 0)}
            icon={Wrench}
            trend={makeTrend(data.data?.total, comparison.data?.total)}
          />
          <Stat
            label="Bookings served"
            value={String(metrics?.total_bookings ?? 0)}
            icon={CalendarDays}
            iconClassName="bg-chart-4/15 text-chart-4"
            trend={makeTrend(metrics?.total_bookings, comparisonMetrics?.total_bookings)}
          />
          <Stat
            label="Completed entries"
            value={String(metrics?.completed_rows ?? 0)}
            icon={CheckCircle2}
            iconClassName="bg-emerald-500/15 text-emerald-400"
            trend={makeTrend(metrics?.completed_rows, comparisonMetrics?.completed_rows)}
          />
          <Stat
            label="Completed service value"
            value={formatPHP(metrics?.completed_value ?? 0)}
            icon={CircleDollarSign}
            iconClassName="bg-accent/15 text-accent"
            trend={makeTrend(metrics?.completed_value, comparisonMetrics?.completed_value)}
          />
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(16rem,.82fr)_minmax(0,1.9fr)]">
        <Card className="border-border/70 bg-card/60">
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" aria-hidden="true" />
              <h2 className="font-display text-sm tracking-wide uppercase">Status breakdown</h2>
            </div>
            {byStatus.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Nothing to report for this selection.
              </p>
            ) : (
              <ul className="mt-5 space-y-4 text-sm">
                {byStatus.map(([item, count]) => (
                  <li key={item}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn("size-2.5 shrink-0 rounded-full", statusBarTone(item))}
                          aria-hidden="true"
                        />
                        <span className="truncate">{statusLabel(item)}</span>
                      </span>
                      <span className="font-medium">{count}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", statusBarTone(item))}
                        style={{
                          width: `${Math.max(6, Math.round((count / statusTotal) * 100))}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/60">
          <CardContent className="overflow-x-auto p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <ListFilter className="size-4 text-primary" aria-hidden="true" />
                <h2 className="font-display text-sm tracking-wide uppercase">Recent bookings</h2>
              </div>
              <span className="text-xs text-muted-foreground">
                Page {data.data?.total ? page + 1 : 0} of{" "}
                {Math.max(1, Math.ceil((data.data?.total ?? 0) / pageSize))}
              </span>
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
                  <TableRow key={`${row[0]}-${index}`}>
                    {row.map((cell, cellIndex) => (
                      <TableCell
                        key={`${cellIndex}-${cell}`}
                        data-label={preview.headers[cellIndex]}
                        className="text-sm"
                      >
                        {preview.headers[cellIndex] === "Status" ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] uppercase",
                              statusTone(data.data?.rows[index]?.status ?? ""),
                            )}
                          >
                            {cell}
                          </Badge>
                        ) : (
                          cell
                        )}
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
        <AlertDialogContent className="max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm {pendingExport?.toUpperCase()} export</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to export the selected {reportTitle.toLowerCase()} as a{" "}
              <strong className="font-medium text-foreground">
                {pendingExport?.toUpperCase()}
              </strong>{" "}
              file with all {data.data?.total ?? 0} {rowLabel}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ExportFormatPreview
            format={pendingExport}
            reportKind={reportKind}
            title={reportTitle}
            scope={reportScope}
            data={preview}
          />
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

function ExportFormatPreview({
  format,
  reportKind,
  title,
  scope,
  data,
}: {
  format: ExportType | null;
  reportKind: ReportKind;
  title: string;
  scope: string;
  data: ExportData;
}) {
  const isDocx = format === "docx";
  const formatLabel = isDocx ? "Word document (.docx)" : "PDF document (.pdf)";
  const previewRows = data.rows.slice(0, 3);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-medium">{formatLabel}</p>
            <p className="text-xs text-muted-foreground">Export preview</p>
          </div>
        </div>
        <span className="rounded border border-border bg-background px-2 py-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          {format}
        </span>
      </div>

      {isDocx ? (
        <div className="rounded-md border border-border bg-zinc-200/75 p-3 sm:p-4">
          <div className="mx-auto aspect-[210/297] max-h-80 w-full max-w-56 overflow-hidden bg-white px-4 py-5 font-serif text-zinc-950 shadow-md">
            <p className="text-center text-[7px] font-bold tracking-wide">{SHOP_EXPORT_NAME}</p>
            <p className="mt-1 text-center text-[6px] font-bold uppercase">{title}</p>
            <p className="mt-1 text-center text-[5px]">Generated: {formatBusinessTimestamp()}</p>
            <p className="mt-3 text-[5px] leading-relaxed">Scope: {scope}</p>
            <div className="mt-2 space-y-0.5 text-[5px] leading-relaxed">
              {data.summary.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
            <ExportDocumentTable data={data} rows={previewRows} variant="docx" />
            <div className="mt-3 text-right text-[5px] leading-relaxed">
              <p className="font-bold">{SHOP_OWNER_NAME}</p>
              <p>Shop Owner</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-border bg-zinc-200/75 p-3 sm:p-4">
          <div
            className={cn(
              "relative mx-auto overflow-hidden bg-white px-4 py-3 font-sans text-zinc-950 shadow-md",
              reportKind === "services"
                ? "aspect-[297/210] w-full"
                : "aspect-[210/297] max-h-80 w-full max-w-56",
            )}
          >
            <div className="flex items-center justify-center gap-1.5">
              <img src={exportLogoUrl} alt="" className="size-5 object-contain" />
              <p className="text-[7px] font-bold">{SHOP_EXPORT_NAME}</p>
            </div>
            <p className="mt-3 text-[6px] font-bold uppercase">{title}</p>
            <p className="mt-1 text-[5px]">Generated: {formatBusinessTimestamp()}</p>
            <p className="mt-1 text-[5px] leading-relaxed">Scope: {scope}</p>
            <div className="mt-2 space-y-0.5 text-[5px]">
              {data.summary.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
            <ExportDocumentTable data={data} rows={previewRows} variant="pdf" />
            <div className="absolute right-4 bottom-3 w-20 text-center text-[5px]">
              <div className="border-t border-zinc-700 pt-0.5 font-bold">{SHOP_OWNER_NAME}</div>
              <p>Shop Owner</p>
              <p>Signature over printed name</p>
            </div>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        This preview mirrors the actual {isDocx ? "Word document" : "PDF"} layout. The exported file
        includes the complete table.
      </p>
    </div>
  );
}

function ExportDocumentTable({
  data,
  rows,
  variant,
}: {
  data: ExportData;
  rows: string[][];
  variant: "pdf" | "docx";
}) {
  return (
    <table
      className={cn(
        "mt-2 w-full table-fixed border-collapse text-[4px] leading-tight",
        variant === "docx" ? "border border-zinc-700" : "border border-zinc-500",
      )}
    >
      <thead className={variant === "pdf" ? "bg-zinc-200" : "bg-white"}>
        <tr>
          {data.headers.map((header) => (
            <th
              key={header}
              className="truncate border border-zinc-500 px-0.5 py-0.5 text-left font-bold"
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.join("-")}-${index}`}>
            {row.map((cell, cellIndex) => (
              <td
                key={`${cell}-${cellIndex}`}
                className="truncate border border-zinc-500 px-0.5 py-0.5"
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
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
    <div className="min-w-0 space-y-1.5">
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

function PeriodPicker({
  value,
  from,
  to,
  error,
  onValueChange,
  onRangeChange,
}: {
  value: PeriodPreset;
  from: string;
  to: string;
  error?: string | undefined;
  onValueChange: (value: PeriodPreset) => void;
  onRangeChange: (range: { from: string; to: string }) => void;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const customOpenTimer = useRef<number | null>(null);
  const selectedRange = from
    ? { from: dateFromIso(from), to: to ? dateFromIso(to) : undefined }
    : undefined;
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(selectedRange);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => selectedRange?.from ?? new Date());

  function clearPendingCustomOpen() {
    if (customOpenTimer.current === null) return;
    window.clearTimeout(customOpenTimer.current);
    customOpenTimer.current = null;
  }

  useEffect(() => clearPendingCustomOpen, []);

  function scheduleCustomOpen() {
    clearPendingCustomOpen();
    setDraftRange(selectedRange);
    setCalendarMonth(selectedRange?.from ?? new Date());
    // Wait until Radix Select has finished restoring focus to its trigger.
    // Opening sooner makes the Popover see that focus restoration as an
    // outside interaction and dismiss itself immediately.
    customOpenTimer.current = window.setTimeout(() => {
      customOpenTimer.current = null;
      setCustomOpen(true);
    }, 100);
  }

  function handlePeriodValueChange(nextValue: string) {
    const nextPeriod = nextValue as PeriodPreset;
    if (nextPeriod !== "custom") {
      clearPendingCustomOpen();
      onValueChange(nextPeriod);
      setCustomOpen(false);
      return;
    }

    onValueChange("custom");
    scheduleCustomOpen();
  }

  return (
    <div className="space-y-1.5">
      <Popover
        open={customOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) clearPendingCustomOpen();
          setCustomOpen(nextOpen);
        }}
      >
        <PopoverAnchor asChild>
          <div>
            <Select value={value} onValueChange={handlePeriodValueChange}>
              <SelectTrigger aria-label="Select report period" aria-invalid={Boolean(error)}>
                <CalendarRange className="mr-2 size-4 shrink-0 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    onPointerDown={option.value === "custom" ? scheduleCustomOpen : undefined}
                    onKeyDown={(event) => {
                      if (
                        option.value === "custom" &&
                        (event.key === "Enter" || event.key === " ")
                      ) {
                        scheduleCustomOpen();
                      }
                    }}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PopoverAnchor>
        <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-2">
          <div className="px-1 pb-2">
            <p className="text-sm font-medium">Custom date range</p>
            <p className="text-xs text-muted-foreground">Select a start date and an end date.</p>
          </div>
          <Calendar
            mode="range"
            selected={draftRange}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            onSelect={setDraftRange}
            classNames={{
              nav: "inset-x-auto left-1/2 w-48 -translate-x-1/2 justify-between",
            }}
          />
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <DateRangeValue label="Start date" value={draftRange?.from} />
            <DateRangeValue label="End date" value={draftRange?.to} />
          </div>
          <div className="mt-3 flex justify-end gap-2 border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDraftRange(selectedRange);
                setCustomOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!draftRange?.from || !draftRange.to}
              onClick={() => {
                if (!draftRange?.from || !draftRange.to) return;
                const draftFrom = format(draftRange.from, "yyyy-MM-dd");
                const draftTo = format(draftRange.to, "yyyy-MM-dd");
                onRangeChange(
                  draftFrom <= draftTo
                    ? { from: draftFrom, to: draftTo }
                    : { from: draftTo, to: draftFrom },
                );
                setCustomOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <FieldError message={error} />
    </div>
  );
}

function DateRangeValue({ label, value }: { label: string; value: Date | undefined }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
      <p className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 truncate font-medium text-foreground">
        {value ? format(value, "MMM d, yyyy") : "Not selected"}
      </p>
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
    headers: ["Reference", "Customer", "Date", "Service", "Status", "Estimate"],
    rows: bookingRows.map((row) => [
      row.reference_code,
      row.customer_name,
      formatDateLong(row.appointment_date),
      row.service || "—",
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

function getInitialFilters(today: string): ReportFilters {
  const range = periodRange("this_month", today);
  return {
    periodPreset: "this_month",
    ...range,
    category: "all",
    serviceName: "all",
    status: "all",
  };
}

function dateFromIso(value: string) {
  return new Date(`${value}T12:00:00`);
}

function formatDateRange(from: string, to: string) {
  if (!from) return "Select custom dates";

  const fromDate = dateFromIso(from);
  const fromLabel = format(fromDate, "MMM d, yyyy");
  if (!to) return `${fromLabel} to Select end date`;

  const toDate = dateFromIso(to);
  return fromDate.getFullYear() === toDate.getFullYear()
    ? `${format(fromDate, "MMM d")} to ${format(toDate, "MMM d, yyyy")}`
    : `${fromLabel} to ${format(toDate, "MMM d, yyyy")}`;
}

function periodRange(preset: Exclude<PeriodPreset, "custom">, today: string) {
  if (preset === "today") return { from: today, to: today };
  if (preset === "this_week") {
    const day = new Date(`${today}T00:00:00`).getDay();
    return { from: addDays(today, -((day + 6) % 7)), to: today };
  }
  if (preset === "this_year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: `${today.slice(0, 8)}01`, to: today };
}

function previousPeriodRange(from: string, to: string) {
  const inclusiveDays = Math.max(
    1,
    Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000) + 1,
  );
  return {
    from: addDays(from, -inclusiveDays),
    to: addDays(from, -1),
  };
}

function makeTrend(
  current: number | string | null | undefined,
  previous: number | string | null | undefined,
): Trend {
  if (current === undefined || previous === undefined)
    return { direction: "flat", label: "—", description: "Comparing previous period" };

  const currentValue = Number(current ?? 0);
  const previousValue = Number(previous ?? 0);
  if (previousValue === 0) {
    if (currentValue === 0)
      return { direction: "flat", label: "0%", description: "vs. previous period" };
    return { direction: "up", label: "New", description: "vs. previous period" };
  }

  const change = ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
  return {
    direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
    label: `${Math.abs(change).toFixed(change >= 10 ? 0 : 1)}%`,
    description: "vs. previous period",
  };
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

async function exportDocx(
  data: ExportData,
  reportKind: ReportKind,
  title: string,
  scope: string,
  from: string,
  to: string,
) {
  const {
    AlignmentType,
    Document,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import("docx");

  const headerRow = new TableRow({
    tableHeader: true,
    children: data.headers.map(
      (header) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: header, bold: true, size: 18 })],
            }),
          ],
        }),
    ),
  });
  const rows = data.rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: cell, size: 18 })] })],
            }),
        ),
      }),
  );
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: SHOP_EXPORT_NAME, bold: true, size: 32 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 24 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Generated: ${formatBusinessTimestamp()}`, size: 18 })],
          }),
          new Paragraph({ children: [new TextRun({ text: `Scope: ${scope}`, size: 18 })] }),
          ...data.summary.map(
            (line) => new Paragraph({ children: [new TextRun({ text: line, size: 18 })] }),
          ),
          new Paragraph({ text: "" }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...rows],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: SHOP_OWNER_NAME, bold: true, size: 18 })],
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: "Shop Owner", size: 16 })],
          }),
        ],
      },
    ],
  });
  const file = await Packer.toBlob(document);
  downloadBlob(
    file,
    `fake-rider-${fileName(reportKind)}-${from}-to-${to}.docx`,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
}

function downloadBlob(contents: BlobPart, filename: string, type: string) {
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

function statusBarTone(status: string) {
  if (status === "completed") return "bg-sky-500";
  if (status === "cancelled" || status === "rejected" || status === "no_show") {
    return "bg-destructive";
  }
  if (status === "in_progress") return "bg-accent";
  if (status === "confirmed") return "bg-emerald-500";
  return "bg-muted-foreground";
}

function Stat({
  label,
  value,
  trend,
  icon: Icon,
  iconClassName,
}: {
  label: string;
  value: string;
  trend: Trend;
  icon: LucideIcon;
  iconClassName?: string;
}) {
  return (
    <Card className="border-border/70 bg-card/60">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary",
              iconClassName,
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <p className="text-xs tracking-wider text-muted-foreground uppercase">{label}</p>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-2xl text-primary">{value}</p>
            <p
              className={cn(
                "mt-2 flex items-center gap-1 text-xs font-medium",
                trend.direction === "up" && "text-emerald-500",
                trend.direction === "down" && "text-destructive",
                trend.direction === "flat" && "text-muted-foreground",
              )}
            >
              {trend.direction === "up" && <TrendingUp className="size-3.5" aria-hidden="true" />}
              {trend.direction === "down" && (
                <TrendingDown className="size-3.5" aria-hidden="true" />
              )}
              {trend.label}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{trend.description}</p>
          </div>
          <TrendLine direction={trend.direction} />
        </div>
      </CardContent>
    </Card>
  );
}

function TrendLine({ direction }: Pick<Trend, "direction">) {
  const path =
    direction === "up"
      ? "M2 25 L13 16 L23 19 L34 8 L46 12 L58 2"
      : direction === "down"
        ? "M2 4 L13 13 L23 10 L34 21 L46 17 L58 28"
        : "M2 16 L13 16 L23 15 L34 16 L46 15 L58 16";
  return (
    <svg
      viewBox="0 0 60 30"
      className={cn(
        "h-8 w-14 shrink-0",
        direction === "up" && "text-emerald-500",
        direction === "down" && "text-destructive",
        direction === "flat" && "text-muted-foreground",
      )}
      aria-hidden="true"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
