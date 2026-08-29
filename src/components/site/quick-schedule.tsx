"use client";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";

import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getAvailability } from "@/lib/booking.functions";
import {
  computeAvailableDates,
  computeAvailableSlots,
  computeFullyBookedDates,
  type Availability,
  type ComputedSlot,
} from "@/lib/availability";
import { formatDateLong, formatPHP, formatTime } from "@/lib/shop";
import { cn } from "@/lib/utils";

export function QuickSchedule() {
  const navigate = useNavigate();
  const availabilityFn = useServerFn(getAvailability);

  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const services = useQuery({
    queryKey: ["quick-schedule-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id,name,price,duration_minutes")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const availability = useQuery<Availability>({
    queryKey: ["home-availability", serviceId],
    queryFn: () => availabilityFn({ data: { days: 45, serviceIds: [serviceId] } }),
    enabled: !!serviceId,
    staleTime: 60_000,
  });

  const dates = useMemo(
    () => (availability.data ? computeAvailableDates(availability.data) : []),
    [availability.data],
  );
  const dateSet = useMemo(() => new Set(dates), [dates]);
  const fullyBookedDates = useMemo(
    () => (availability.data ? computeFullyBookedDates(availability.data) : []),
    [availability.data],
  );

  const slots = useMemo(
    () => (availability.data && date ? computeAvailableSlots(availability.data, date) : []),
    [availability.data, date],
  );

  const selectedDate = date ? parseISO(date) : undefined;
  const availabilityError = availability.data?.error;

  function handleConfirm() {
    if (!date || !time) return;
    navigate({ to: "/book", search: { date, startTime: time, serviceId } });
  }

  const canConfirm = !!serviceId && !!date && !!time && !availability.isError;

  return (
    <section className="site-container py-12">
      <Card className="border-border/70 bg-card/40">
        <CardContent className="p-6 md:p-8">
          <p className="text-xs tracking-[0.3em] text-accent uppercase">Quick schedule</p>
          <h2 className="mt-2 font-display text-3xl font-bold uppercase md:text-4xl">
            Start with your service
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Choose a service first, then we’ll show dates and times with enough mechanic capacity
            for its duration and buffer.
          </p>

          <div className="mt-6">
            <p className="mb-2 text-sm text-muted-foreground">1. Choose a service</p>
            {services.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading services...
              </p>
            ) : services.isError ? (
              <p className="text-sm text-destructive">Could not load services. Please refresh.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {services.data?.map((service) => (
                  <button
                    type="button"
                    key={service.id}
                    onClick={() => {
                      setServiceId(service.id);
                      setDate("");
                      setTime("");
                    }}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      serviceId === service.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card/50 hover:border-primary/50",
                    )}
                  >
                    <span className="font-display block tracking-wide uppercase">
                      {service.name}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {service.duration_minutes} mins + 15-min buffer · {formatPHP(service.price)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {!serviceId ? (
            <p className="mt-5 text-sm text-muted-foreground">
              Select a service to see available dates and times.
            </p>
          ) : availability.isLoading && !availability.data ? (
            <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading available schedules...
            </p>
          ) : availability.isError || availabilityError ? (
            <p className="mt-6 text-sm text-destructive">
              {availabilityError ?? "Could not load schedules. Please refresh or try again later."}
            </p>
          ) : (
            <>
              <p className="mt-5 text-sm text-muted-foreground">
                2. Pick an available date. Fully Booked dates cannot be selected.
              </p>
              <div className="mt-5 w-full overflow-x-auto rounded-lg border border-border bg-card/50 p-2">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => {
                    if (!d) return;
                    const iso = format(d, "yyyy-MM-dd");
                    if (!dateSet.has(iso)) return;
                    setDate(iso);
                    setTime("");
                  }}
                  disabled={(d) => {
                    const iso = format(d, "yyyy-MM-dd");
                    return !dateSet.has(iso);
                  }}
                  modifiers={{ fullyBooked: fullyBookedDates.map((value) => parseISO(value)) }}
                  modifiersClassNames={{
                    fullyBooked: "bg-destructive/15 text-destructive line-through opacity-100",
                  }}
                  classNames={{
                    nav: "justify-between gap-1",
                    month_caption:
                      "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
                  }}
                />
              </div>
              {fullyBookedDates.length > 0 && (
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-3 w-3 rounded-sm bg-destructive/15 ring-1 ring-destructive/40" />
                  Fully Booked dates cannot be selected.
                </p>
              )}

              <div className="mt-5">
                <p className="mb-2 text-sm text-muted-foreground">
                  {date
                    ? `3. Time slots for ${formatDateLong(date)}`
                    : "3. Choose a date above to view available time slots."}
                </p>
                {date ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {slots.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No time slots available for this date.
                      </p>
                    ) : (
                      slots.map((slot) => (
                        <QuickTimeSlot
                          key={slot.id}
                          slot={slot}
                          selected={time === slot.startTime}
                          onSelect={() => setTime(slot.startTime)}
                        />
                      ))
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Time slots will appear here after you choose a date.
                  </div>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card/60 p-4">
                <div>
                  <p className="text-xs tracking-widest text-muted-foreground uppercase">
                    Selected schedule
                  </p>
                  <p className="font-display text-lg text-primary">
                    {date && time
                      ? `${formatDateLong(date)} at ${formatTime(time)}`
                      : date
                        ? formatDateLong(date)
                        : "Pick a date and time"}
                  </p>
                </div>
                <Button
                  size="lg"
                  className="font-display tracking-wide uppercase"
                  disabled={!canConfirm}
                  onClick={handleConfirm}
                >
                  <CalendarCheck /> Continue to booking
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function QuickTimeSlot({
  slot,
  selected,
  onSelect,
}: {
  slot: ComputedSlot;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={slot.disabled}
      onClick={onSelect}
      className={cn(
        "rounded-lg border p-3 text-center transition-colors",
        slot.disabled && "cursor-not-allowed opacity-40",
        selected
          ? "border-primary bg-primary/15"
          : "border-border bg-card/50 hover:border-primary/50",
      )}
    >
      <span className="font-display block">{formatTime(slot.startTime)}</span>
      <span className="block text-[11px] text-muted-foreground">
        {slot.disabled ? "Unavailable" : "Available"}
      </span>
    </button>
  );
}
