import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Archive } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
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
import {
  decodeBlockReason,
  encodeBlockReason,
  formatDateLong,
  formatTime,
  shopTimeOptions,
} from "@/lib/shop";

export const Route = createFileRoute("/_authenticated/admin/schedule-blocks")({
  component: ScheduleBlocks,
});

function ScheduleBlocks() {
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [reason, setReason] = useState("");
  const [formErrors, setFormErrors] = useState<
    Partial<Record<"date" | "start" | "end", string | undefined>>
  >({});

  const blocks = useQuery({
    queryKey: ["schedule-blocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_blocks")
        .select("*")
        .eq("is_active", true)
        .order("block_date");
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (slot === "all") {
        const { error } = await supabase.from("schedule_blocks").insert({
          block_date: date,
          start_time: null,
          reason: encodeBlockReason(null, reason.trim()),
        });
        if (error) throw error;
      } else if (slot === "custom") {
        const { error } = await supabase.from("schedule_blocks").insert({
          block_date: date,
          start_time: `${customStart}:00`,
          reason: encodeBlockReason(`${customEnd}:00`, reason.trim()),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Schedule blocked");
      setDate("");
      setReason("");
      setSlot("all");
      setCustomStart("");
      setCustomEnd("");
      qc.invalidateQueries({ queryKey: ["schedule-blocks"] });
    },
    onError: (err: Error) => {
      const msg = err.message.toLowerCase();
      if (msg.includes("unique") || msg.includes("duplicate")) {
        setFormErrors({
          date: "A block for this date already exists. Remove the existing block first.",
        });
      } else if (msg.includes("foreign")) {
        setFormErrors({
          date: "Referenced data no longer exists. Refresh the page and try again.",
        });
      } else {
        setFormErrors({
          date: `Could not block that schedule. Please check your inputs and try again: ${err.message}`,
        });
      }
    },
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("schedule_blocks")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      qc.setQueryData<Array<{ id: string }>>(["schedule-blocks"], (blocks) =>
        blocks?.filter((block) => block.id !== id),
      );
      toast.success("Block archived");
      qc.invalidateQueries({ queryKey: ["schedule-blocks"], exact: false });
      qc.invalidateQueries({ queryKey: ["archived-blocks"], exact: false });
    },
    onError: (err: Error) => {
      const msg = err.message.toLowerCase();
      if (msg.includes("not found") || msg.includes("no rows")) {
        toast.error("This block no longer exists. It may have been removed already.");
      } else if (msg.includes("permission") || msg.includes("forbidden")) {
        toast.error(
          "You don't have permission to archive schedule blocks. Please contact an admin.",
        );
      } else {
        toast.error(`Could not archive the block. Please try again: ${err.message}`);
      }
    },
  });

  function handleAdd() {
    const nextErrors: Partial<Record<"date" | "start" | "end", string>> = {};
    if (!date) nextErrors.date = "Choose the date to block.";
    if (slot === "custom") {
      if (!customStart) nextErrors.start = "Please set a start time.";
      if (!customEnd) nextErrors.end = "Please set an end time.";
      if (customStart && customStart < "08:00") {
        nextErrors.start = "Start time cannot be earlier than 8:00 AM (shop opening).";
      }
      if (customEnd && customEnd > "17:00") {
        nextErrors.end = "End time cannot be later than 5:00 PM (shop closing).";
      }
      if (customStart && customEnd && customStart >= customEnd) {
        nextErrors.end = "End time must be after start time.";
      }
    }
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) add.mutate();
  }

  return (
    <div>
      <PageHeader
        title="Schedule Blocks"
        description="Close whole days or custom time ranges (holidays, out-of-town, maintenance)."
      />

      <Card className="mb-6 border-border/70 bg-card/60">
        <CardContent className="grid gap-4 p-5 sm:grid-cols-4 sm:items-end">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setFormErrors((current) => ({ ...current, date: undefined }));
              }}
              aria-invalid={!!formErrors.date}
            />
            <FieldError message={formErrors.date} />
          </div>
          <div className="space-y-1.5">
            <Label>Slot</Label>
            <Select
              value={slot}
              onValueChange={(v) => {
                setSlot(v);
                setCustomStart("");
                setCustomEnd("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Whole day</SelectItem>
                <SelectItem value="custom">Custom Time Range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {slot === "custom" && (
            <>
              <div className="grid grid-cols-2 gap-2 space-y-0 space-x-2">
                <div className="space-y-1.5">
                  <Label>Start</Label>
                  <Select
                    value={customStart}
                    onValueChange={(value) => {
                      setCustomStart(value);
                      setFormErrors((current) => ({ ...current, start: undefined }));
                    }}
                  >
                    <SelectTrigger className="w-full" aria-invalid={!!formErrors.start}>
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
                  <FieldError message={formErrors.start} />
                </div>
                <div className="space-y-1.5">
                  <Label>End</Label>
                  <Select
                    value={customEnd}
                    onValueChange={(value) => {
                      setCustomEnd(value);
                      setFormErrors((current) => ({ ...current, end: undefined }));
                    }}
                  >
                    <SelectTrigger className="w-full" aria-invalid={!!formErrors.end}>
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
                  <FieldError message={formErrors.end} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Note: Time slots are available in 30-minute intervals only, from 8:00 AM to 5:00 PM.
                The End Time must be later than the Start Time.
              </p>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Holiday, team event..."
            />
          </div>
          <Button onClick={handleAdd} disabled={add.isPending} className="font-display uppercase">
            <Plus /> Block
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/60">
        <CardContent className="overflow-x-auto p-0">
          <Table className="admin-data-table">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Slot</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blocks.data?.map((b) => {
                const { endTime, userReason } = decodeBlockReason(b.reason);
                return (
                  <TableRow key={b.id}>
                    <TableCell data-label="Date" className="text-sm">
                      {formatDateLong(b.block_date)}
                    </TableCell>
                    <TableCell data-label="Slot" className="text-sm">
                      {!b.start_time
                        ? "Whole day"
                        : endTime
                          ? `${formatTime(String(b.start_time).slice(0, 5))} – ${formatTime(endTime.slice(0, 5))}`
                          : formatTime(String(b.start_time).slice(0, 5))}
                    </TableCell>
                    <TableCell data-label="Reason" className="text-sm text-muted-foreground">
                      {userReason || "-"}
                    </TableCell>
                    <TableCell data-label="Action" className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => archive.mutate(b.id)}>
                        <Archive className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {blocks.data?.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">No blocked schedules.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
