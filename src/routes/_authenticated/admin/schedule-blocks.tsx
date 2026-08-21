import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Archive } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

  const blocks = useQuery({
    queryKey: ["schedule-blocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_blocks")
        .select("*")
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
        if (!customStart || !customEnd) {
          toast.error("Please set a start and end time");
          return;
        }
        if (customStart < "08:00") {
          toast.error("Start time cannot be earlier than 8:00 AM (shop opening).");
          return;
        }
        if (customEnd > "17:00") {
          toast.error("End time cannot be later than 5:00 PM (shop closing).");
          return;
        }
        if (customStart >= customEnd) {
          toast.error("End time must be after start time");
          return;
        }
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
        toast.error("A block for this date already exists. Remove the existing block first.");
      } else if (msg.includes("foreign")) {
        toast.error("Referenced data no longer exists. Refresh the page and try again.");
      } else {
        toast.error(
          `Could not block that schedule. Please check your inputs and try again: ${err.message}`,
        );
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
    onSuccess: () => {
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
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
                <div className="space-y-1.5">
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
          <Button
            onClick={() => add.mutate()}
            disabled={!date || add.isPending || (slot === "custom" && (!customStart || !customEnd))}
            className="font-display uppercase"
          >
            <Plus /> Block
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/60">
        <CardContent className="overflow-x-auto p-0">
          <Table>
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
                    <TableCell className="text-sm">{formatDateLong(b.block_date)}</TableCell>
                    <TableCell className="text-sm">
                      {!b.start_time
                        ? "Whole day"
                        : endTime
                          ? `${formatTime(String(b.start_time).slice(0, 5))} – ${formatTime(endTime.slice(0, 5))}`
                          : formatTime(String(b.start_time).slice(0, 5))}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {userReason || "-"}
                    </TableCell>
                    <TableCell className="text-right">
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
