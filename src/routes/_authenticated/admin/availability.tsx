import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatDateLong, shopTimeOptions } from "@/lib/shop";

export const Route = createFileRoute("/_authenticated/admin/availability")({
  component: AvailabilityPage,
});

const SHIFT_PRESETS = {
  "whole-day": { start: "08:00", end: "17:00", label: "Whole Day (8:00 AM – 5:00 PM)" },
  morning: { start: "08:00", end: "12:00", label: "Morning (8:00 AM – 12:00 PM)" },
  afternoon: { start: "13:00", end: "17:00", label: "Afternoon (1:00 PM – 5:00 PM)" },
} as const;

const PRESET_LABELS: Record<string, string> = {};
for (const [key, preset] of Object.entries(SHIFT_PRESETS)) {
  PRESET_LABELS[`${preset.start}|${preset.end}`] = preset.label;
}

type ScheduleWithCrew = {
  id: string;
  crew_id: string;
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
  is_working: boolean;
  schedule_date: string | null;
  note: string | null;
  crew_members?: { name: string; role: string } | null;
};

type WorkingMechanic = {
  id: string;
  name: string;
  role: string;
  start_time: string | null;
  end_time: string | null;
  is_date_assignment: boolean;
};

type CrewMember = {
  id: string;
  name: string;
  role: string;
};

function dateToKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function AvailabilityPage() {
  const qc = useQueryClient();
  const [viewDate, setViewDate] = useState<Date | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [assignDates, setAssignDates] = useState<Date[]>([]);
  const [assignMechanic, setAssignMechanic] = useState<string>("");
  const [assignShift, setAssignShift] = useState("whole-day");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const crew = useQuery({
    queryKey: ["crew-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crew_members")
        .select("*")
        .eq("is_active", true)
        .eq("is_archived", false)
        .order("name");
      if (error) throw error;
      return Array.from(
        new Map((data ?? []).map((c) => [c.name.trim(), c])).values(),
      ) as CrewMember[];
    },
  });

  const schedules = useQuery({
    queryKey: ["crew-schedules-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crew_schedules")
        .select("*,crew_members!inner(name,role)")
        .order("crew_id")
        .order("schedule_date", { ascending: true, nullsFirst: false })
        .order("day_of_week");
      if (error) throw error;
      return (data ?? []) as ScheduleWithCrew[];
    },
  });

  const saveSchedule = useMutation({
    mutationFn: async (payload: {
      crew_id: string;
      schedule_dates: string[];
      start_time: string;
      end_time: string;
      is_working: boolean;
      note?: string;
    }) => {
      const { error } = await supabase.from("crew_schedules").upsert(
        payload.schedule_dates.map((scheduleDate) => {
          const [y, m, d] = scheduleDate.split("-").map(Number);
          return {
            crew_id: payload.crew_id,
            schedule_date: scheduleDate,
            day_of_week: new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay(),
            start_time: payload.is_working ? `${payload.start_time}:00` : null,
            end_time: payload.is_working ? `${payload.end_time}:00` : null,
            is_working: payload.is_working,
            note: payload.note || null,
          };
        }),
        { onConflict: "crew_id,schedule_date", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    onSuccess: (_, payload) => {
      toast.success(
        payload.schedule_dates.length === 1
          ? "Working day scheduled"
          : `${payload.schedule_dates.length} working days scheduled`,
      );
      qc.invalidateQueries({ queryKey: ["crew-schedules-all"] });
    },
    onError: (err: Error) => {
      const msg = err.message.toLowerCase();
      if (msg.includes("unique") || msg.includes("duplicate")) {
        toast.error(
          "A schedule for this crew on this date already exists. Remove or edit it first.",
        );
      } else if (msg.includes("foreign")) {
        toast.error("Referenced crew member no longer exists. Refresh the page and try again.");
      } else {
        console.error("Schedule save failed:", err);
        toast.error(`Could not save the schedule. Please try again: ${err.message}`);
      }
    },
  });

  const deleteSchedule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crew_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Schedule removed");
      qc.invalidateQueries({ queryKey: ["crew-schedules-all"] });
    },
    onError: (err: Error) => {
      const msg = err.message.toLowerCase();
      if (msg.includes("not found") || msg.includes("no rows")) {
        toast.error("This schedule no longer exists. It may have been removed already.");
      } else {
        console.error("Schedule delete failed:", err);
        toast.error(`Could not remove the schedule. Please try again: ${err.message}`);
      }
    },
  });

  // Show assignments that were explicitly made for the selected date.
  const getWorkingMechanicsForDate = useCallback(
    (dateStr: string) => {
      const allSchedules = schedules.data ?? [];
      const crewMap = new Map((crew.data ?? []).map((c) => [c.id, c]));

      const relevant = allSchedules.filter(
        (schedule) => schedule.schedule_date === dateStr && schedule.is_working,
      );

      // Legacy duplicate rows should not make a mechanic appear twice.
      const seen = new Set<string>();
      const result: WorkingMechanic[] = [];
      for (const s of relevant) {
        if (seen.has(s.crew_id)) continue;
        seen.add(s.crew_id);
        result.push({
          id: s.id,
          name: s.crew_members?.name ?? crewMap.get(s.crew_id)?.name ?? "Unknown",
          role: s.crew_members?.role ?? "Mechanic",
          start_time: s.start_time ? String(s.start_time).slice(0, 5) : null,
          end_time: s.end_time ? String(s.end_time).slice(0, 5) : null,
          is_date_assignment: true,
        });
      }
      return result;
    },
    [crew.data, schedules.data],
  );

  const assignDateStrs = useMemo(() => assignDates.map(dateToKey), [assignDates]);

  const viewDateStr = useMemo(() => {
    if (!viewDate) return null;
    const y = viewDate.getFullYear();
    const m = String(viewDate.getMonth() + 1).padStart(2, "0");
    const d = String(viewDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [viewDate]);

  const dayInfo = useMemo(() => {
    if (!viewDateStr) return null;
    return getWorkingMechanicsForDate(viewDateStr);
  }, [viewDateStr, getWorkingMechanicsForDate]);

  const handleSave = async () => {
    if (!assignMechanic || assignDateStrs.length === 0) {
      toast.error("Please select at least one working day and a mechanic");
      return;
    }

    const existingDates = new Set(
      (schedules.data ?? [])
        .filter((schedule) => schedule.crew_id === assignMechanic && schedule.schedule_date)
        .map((schedule) => schedule.schedule_date),
    );
    const newDateStrs = assignDateStrs.filter((date) => !existingDates.has(date));

    if (newDateStrs.length === 0) {
      toast.error("The mechanic is already assigned on each selected day");
      return;
    }

    const skippedDays = assignDateStrs.length - newDateStrs.length;

    let startTime: string;
    let endTime: string;

    if (assignShift === "custom") {
      if (!customStart || !customEnd) {
        toast.error("Please select a start and end time");
        return;
      }
      if (customStart >= customEnd) {
        toast.error("End time must be after start time");
        return;
      }
      startTime = customStart;
      endTime = customEnd;
    } else {
      const preset = SHIFT_PRESETS[assignShift as keyof typeof SHIFT_PRESETS];
      startTime = preset.start;
      endTime = preset.end;
    }

    try {
      await saveSchedule.mutateAsync({
        crew_id: assignMechanic,
        schedule_dates: newDateStrs,
        start_time: startTime,
        end_time: endTime,
        is_working: true,
      });
      setAssignMechanic("");
      setAssignDates([]);
      setAssignShift("whole-day");
      setCustomStart("");
      setCustomEnd("");
      setDialogOpen(false);
      if (skippedDays > 0) {
        toast.info(
          `${skippedDays} ${skippedDays === 1 ? "day was" : "days were"} already assigned and left unchanged`,
        );
      }
    } catch {
      // Error already surfaced via mutation's onError toast
    }
  };

  return (
    <div>
      <PageHeader
        title="Crew Scheduling"
        description="View and manage crew assignments for specific dates."
        action={
          <Button
            className="font-display uppercase"
            onClick={() => {
              setAssignMechanic("");
              setAssignShift("whole-day");
              setCustomStart("");
              setCustomEnd("");
              setAssignDates([]);
              setDialogOpen(true);
            }}
          >
            <Plus /> Assign crew
          </Button>
        }
      />

      {/* Calendar view */}
      <Card className="border-border/70 bg-card/60">
        <CardHeader>
          <CardTitle className="font-display text-lg tracking-wide uppercase">
            Crew Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <p className="mb-4 text-sm text-muted-foreground">
            Click a day to view the crew assigned to that date.
          </p>

          <div className="grid gap-2 md:grid-cols-[300px_1fr]">
            {/* Day info panel — slides in from the left */}
            <div className="overflow-hidden">
              {dayInfo !== null ? (
                <div key={viewDateStr} className="animate-in slide-in-from-left duration-300">
                  <Card className="border-border/70 bg-card/40">
                    <CardHeader>
                      <CardTitle className="font-display text-sm uppercase">
                        {viewDateStr ? formatDateLong(viewDateStr) : ""}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      {dayInfo.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No mechanics are scheduled to work on this day.
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Mechanic</TableHead>
                              <TableHead>Shift</TableHead>
                              <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dayInfo.map((w) => (
                              <TableRow key={w.id}>
                                <TableCell className="text-sm">{w.name}</TableCell>
                                <TableCell className="text-xs">
                                  {w.start_time && w.end_time
                                    ? (PRESET_LABELS[`${w.start_time}|${w.end_time}`] ??
                                      `${w.start_time} - ${w.end_time}`)
                                    : "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                  {w.is_date_assignment && (
                                    <button
                                      type="button"
                                      onClick={() => deleteSchedule.mutate(w.id)}
                                      className="rounded px-2 py-1 text-xs text-destructive hover:underline"
                                    >
                                      Remove assignment
                                    </button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="flex min-h-[120px] w-full items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    Click a day to view the crew assigned to that date.
                  </p>
                </div>
              )}
            </div>

            {/* Calendar */}
            <Calendar
              mode="single"
              selected={viewDate}
              onSelect={setViewDate}
              className="border-border/70"
              classNames={{
                months: "w-full",
                month: "w-full",
                table: "w-full",
                nav: "justify-between gap-1",
                month_caption:
                  "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Assign crew dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display uppercase">Assign crew</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Working days</Label>
              <Calendar
                mode="multiple"
                selected={assignDates}
                onSelect={(dates) => setAssignDates(dates ?? [])}
                className="border-border/70"
                classNames={{
                  months: "w-full",
                  month: "w-full",
                  table: "w-full",
                  nav: "justify-between gap-1",
                  month_caption:
                    "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
                }}
              />
              <p className="text-xs text-muted-foreground">
                {assignDateStrs.length === 0
                  ? "Choose one or more days for this crew member."
                  : `${assignDateStrs.length} ${assignDateStrs.length === 1 ? "day" : "days"} selected.`}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Mechanic</Label>
              <Select
                value={assignMechanic}
                onValueChange={setAssignMechanic}
                disabled={crew.isLoading}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a mechanic" />
                </SelectTrigger>
                <SelectContent>
                  {(crew.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Shift</Label>
              <Select
                value={assignShift}
                onValueChange={(v) => {
                  setAssignShift(v);
                  setCustomStart("");
                  setCustomEnd("");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whole-day">Whole Day (8:00 AM – 5:00 PM)</SelectItem>
                  <SelectItem value="morning">Morning (8:00 AM – 12:00 PM)</SelectItem>
                  <SelectItem value="afternoon">Afternoon (1:00 PM – 5:00 PM)</SelectItem>
                  <SelectItem value="custom">Custom Time Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {assignShift === "custom" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Start</Label>
                  <Select value={customStart} onValueChange={setCustomStart}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Start time" />
                    </SelectTrigger>
                    <SelectContent>
                      {shopTimeOptions().map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>End</Label>
                  <Select value={customEnd} onValueChange={setCustomEnd}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="End time" />
                    </SelectTrigger>
                    <SelectContent>
                      {shopTimeOptions().map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={handleSave}
              disabled={
                !assignMechanic ||
                assignDateStrs.length === 0 ||
                (assignShift === "custom" && (!customStart || !customEnd)) ||
                saveSchedule.isPending
              }
            >
              {saveSchedule.isPending && <Loader2 className="animate-spin" />}
              Save working days
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
