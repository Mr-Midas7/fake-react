import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Copy, Loader2, CalendarIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { createBooking, getAvailability } from "@/lib/booking.functions";
import {
  SHOP,
  addDays,
  decodeBlockReason,
  formatDateLong,
  formatPHP,
  formatTime,
} from "@/lib/shop";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Book a Service Appointment | Fake Rider Motorparts" },
      {
        name: "description",
        content:
          "Reserve your motorcycle service slot online. Choose your services and schedule a convenient time, then save your reference code.",
      },
      { property: "og:title", content: "Book a Service Appointment | Fake Rider" },
      {
        property: "og:description",
        content: "Reserve your motorcycle service slot online in a few minutes.",
      },
    ],
  }),
  component: BookPage,
});

type Errors = Partial<{
  customerName: string;
  phone: string;
  email: string;
  motoBrand: string;
  motoModel: string;
  motoYear: string;
  plateNumber: string;
  services: string;
  schedule: string;
  terms: string;
}>;

function BookPage() {
  const book = useServerFn(createBooking);
  const availabilityFn = useServerFn(getAvailability);

  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    email: "",
    motoBrand: "",
    motoModel: "",
    motoVariant: "",
    motoYear: "",
    plateNumber: "",
    notes: "",
  });
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [result, setResult] = useState<{ reference: string; total: number } | null>(null);

  const services = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return Array.from(new Map((data ?? []).map((s) => [s.name.trim(), s])).values());
    },
  });

  const motorcycleCatalog = useQuery({
    queryKey: ["motorcycle-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("brand,name")
        .eq("category", "motorcycle")
        .eq("is_active", true)
        .order("brand")
        .order("name");
      if (error) throw error;
      return Array.from(new Map((data ?? []).map((m) => [m.name.trim(), m])).values());
    },
  });

  const brands = useMemo(() => {
    const set = new Set<string>();
    (motorcycleCatalog.data ?? []).forEach((p) => p.brand && set.add(p.brand));
    return Array.from(set).sort();
  }, [motorcycleCatalog.data]);

  const modelsForBrand = useMemo(() => {
    const seen = new Set<string>();
    const list = (motorcycleCatalog.data ?? []).filter((p) => p.brand === form.motoBrand);
    return list
      .filter((p) => {
        if (seen.has(p.name)) return false;
        seen.add(p.name);
        return true;
      })
      .map((p) => ({
        value: p.name,
        label: p.name.replace(new RegExp(`^${p.brand} `), ""),
      }));
  }, [motorcycleCatalog.data, form.motoBrand]);

  const availability = useQuery({
    queryKey: ["availability", serviceIds],
    queryFn: () => availabilityFn({ data: { days: 45, serviceIds } }),
    enabled: serviceIds.length > 0,
  });

  const dates = useMemo(() => {
    if (!availability.data) return [];
    const out: string[] = [];
    let cursor = availability.data.from;
    while (cursor <= availability.data.to) {
      const [y, m, d] = cursor.split("-").map(Number);
      const dow = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
      const fullDayBlocked = availability.data.blocks.some(
        (b) => b.date === cursor && !b.startTime,
      );
      if (dow !== 0 && !fullDayBlocked) out.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return out;
  }, [availability.data]);

  const slots = useMemo(() => {
    if (!availability.data || !date) return [];
    const totalDuration = availability.data.totalDurationMinutes ?? 90;
    const [dy, dm, dd] = date.split("-").map(Number);
    const dow = new Date(Date.UTC(dy ?? 1970, (dm ?? 1) - 1, dd ?? 1)).getUTCDay();

    return availability.data.slots.map((slot) => {
      const slotStartMin =
        parseInt(slot.startTime.slice(0, 2)) * 60 + parseInt(slot.startTime.slice(3, 5));
      const slotEndMin = slotStartMin + totalDuration;

      const blocked = availability.data.blocks.some((b) => {
        if (b.date !== date) return false;
        if (!b.startTime) return true; // whole-day block
        if (b.startTime === slot.startTime) return true; // exact slot match
        if (!b.endTime) return false; // single-slot block that doesn't match
        // Custom range: check overlap
        const bsMin = parseInt(b.startTime.slice(0, 2)) * 60 + parseInt(b.startTime.slice(3, 5));
        const beMin = parseInt(b.endTime.slice(0, 2)) * 60 + parseInt(b.endTime.slice(3, 5));
        return slotStartMin < beMin && slotEndMin > bsMin;
      });

      let availableMechanics = 0;

      // Get date-specific schedules (override weekly), then fall back to weekly
      const allSchedules = availability.data.schedules ?? [];
      const dateSchedules = allSchedules.filter((s) => s.schedule_date === date && s.is_working);
      const weeklySchedules = allSchedules.filter(
        (s) => s.day_of_week === dow && s.is_working && !s.schedule_date,
      );

      // Deduplicate by crew_id, preferring date-specific schedules
      const crewSchedMap = new Map<string, unknown>();
      for (const s of [...dateSchedules, ...weeklySchedules]) {
        const crewId = (s as { crew_id: string }).crew_id;
        if (!crewSchedMap.has(crewId)) crewSchedMap.set(crewId, s);
      }
      const daySchedules = Array.from(crewSchedMap.values()) as Array<{
        crew_id: string;
        start_time: string;
        end_time: string;
      }>;

      const dateExceptions = (availability.data.exceptions ?? []).filter((e) => {
        const sd = new Date(e.start_date);
        const ed = new Date(e.end_date);
        const target = new Date(date);
        return sd <= target && ed >= target;
      });

      for (const sched of daySchedules) {
        const shiftStart = String(sched.start_time).slice(0, 5);
        const shiftEnd = String(sched.end_time).slice(0, 5);
        const shiftStartMin =
          parseInt(shiftStart.slice(0, 2)) * 60 + parseInt(shiftStart.slice(3, 5));
        const shiftEndMin = parseInt(shiftEnd.slice(0, 2)) * 60 + parseInt(shiftEnd.slice(3, 5));

        if (slotStartMin < shiftStartMin || slotEndMin > shiftEndMin) continue;

        const hasException = dateExceptions.some((e) => {
          if (e.crew_id !== sched.crew_id) return false;
          if (e.is_all_day) return true;
          if (e.start_time && e.end_time) {
            const excStart = String(e.start_time).slice(0, 5);
            const excEnd = String(e.end_time).slice(0, 5);
            const excStartMin =
              parseInt(excStart.slice(0, 2)) * 60 + parseInt(excStart.slice(3, 5));
            const excEndMin = parseInt(excEnd.slice(0, 2)) * 60 + parseInt(excEnd.slice(3, 5));
            if (slotStartMin < excEndMin && slotEndMin > excStartMin) return true;
          }
          return false;
        });

        if (hasException) continue;

        availableMechanics++;
      }

      const disabled = blocked || availableMechanics === 0;

      return {
        ...slot,
        remaining: availableMechanics,
        disabled,
      };
    });
  }, [availability.data, date]);

  const availableDateSet = useMemo(() => new Set(dates), [dates]);

  const selectedDate = date ? parseISO(date) : undefined;

  const selectedServices = (services.data ?? []).filter((s) => serviceIds.includes(s.id));
  const total = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await book({
        data: {
          customerName: form.customerName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          motoBrand: form.motoBrand.trim(),
          motoModel: form.motoModel.trim(),
          motoVariant: form.motoVariant.trim(),
          motoYear: Number(form.motoYear),
          plateNumber: form.plateNumber.trim(),
          serviceIds,
          date,
          startTime,
          notes: form.notes.trim(),
          termsAccepted: true as const,
        },
      });
      return res;
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        availability.refetch();
        return;
      }
      setResult({ reference: res.reference, total: res.total });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (err: Error) => {
      const msg = err.message.toLowerCase();
      if (msg.includes("network") || msg.includes("fetch") || msg.includes("connect")) {
        toast.error("Network error. Please check your connection and try again.");
      } else if (msg.includes("timeout")) {
        toast.error("The request timed out. Please try again.");
      } else if (msg.includes("validation") || msg.includes("invalid")) {
        toast.error("Some fields have invalid values. Please review the form.");
      } else {
        toast.error(`Booking failed: ${err.message}. Please review your details and try again.`);
      }
      availability.refetch();
    },
  });

  function validate() {
    const e: Errors = {};
    if (form.customerName.trim().length < 2) e.customerName = "Please enter your full name.";
    if (!/^(09\d{9}|\+639\d{9})$/.test(form.phone.trim()))
      e.phone = "Use a valid PH mobile number (09XXXXXXXXX).";
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim()))
      e.email = "Enter a valid email address.";
    if (!form.motoBrand.trim()) e.motoBrand = "Required";
    if (!form.motoModel.trim()) e.motoModel = "Required";
    const year = Number(form.motoYear);
    if (!year || year < 1970 || year > new Date().getFullYear()) e.motoYear = "Enter a valid year";
    if (form.plateNumber.trim().length < 2) e.plateNumber = "Required";
    if (serviceIds.length === 0) e.services = "Select at least one service.";
    if (!date || !startTime) e.schedule = "Pick a date and time slot.";
    if (!terms) e.terms = "You must accept the terms and conditions.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  if (result) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto w-full max-w-2xl px-4 py-16">
          <Card className="border-primary/40 bg-card/70">
            <CardContent className="p-8 text-center">
              <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
              <h1 className="mt-4 font-display text-3xl uppercase">Appointment reserved</h1>
              <p className="mt-2 text-muted-foreground">
                Save your reference code. You will need it, together with your mobile number, to
                view or cancel your booking.
              </p>
              <div className="mt-6 rounded-xl border border-dashed border-primary/50 bg-primary/5 p-6">
                <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase">
                  Reference code
                </p>
                <p className="font-display text-4xl font-bold tracking-widest text-primary">
                  {result.reference}
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    navigator.clipboard.writeText(result.reference);
                    toast.success("Reference code copied");
                  }}
                >
                  <Copy /> Copy code
                </Button>
              </div>
              <div className="mt-6 space-y-1 text-sm text-muted-foreground">
                <p>
                  {formatDateLong(date)} at {formatTime(startTime)}
                </p>
                <p>Estimated total: {formatPHP(result.total)}</p>
                <p>Status: pending confirmation by the shop</p>
              </div>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Button asChild className="font-display uppercase">
                  <Link to="/my-appointment">View my appointment</Link>
                </Button>
                <Button asChild variant="outline" className="font-display uppercase">
                  <Link to="/">Back to home</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <p className="text-xs tracking-[0.3em] text-accent uppercase">Booking</p>
        <h1 className="font-display text-4xl font-bold uppercase md:text-5xl">
          Reserve your service slot
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Schedule your service online. Walk-ins are accommodated depending on the queue.
        </p>

        <form
          className="mt-10 space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            if (validate()) mutation.mutate();
            else toast.error("Please complete the highlighted fields.");
          }}
        >
          <Section title="1. Your details">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Full name" error={errors.customerName}>
                <Input
                  value={form.customerName}
                  maxLength={80}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      customerName: e.target.value.replace(/[^a-zA-Z\s'-]/g, ""),
                    })
                  }
                  placeholder="Juan Dela Cruz"
                />
              </Field>
              <Field label="Mobile number" error={errors.phone}>
                <Input
                  value={form.phone}
                  maxLength={13}
                  onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })}
                  placeholder="09XXXXXXXXX"
                />
              </Field>
              <Field label="Email (optional)" error={errors.email}>
                <Input
                  value={form.email}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@email.com"
                />
              </Field>
            </div>
          </Section>

          <Section title="2. Motorcycle details">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Brand" error={errors.motoBrand}>
                <Select
                  value={form.motoBrand}
                  onValueChange={(v) => setForm({ ...form, motoBrand: v, motoModel: "" })}
                  disabled={motorcycleCatalog.isLoading || brands.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Model" error={errors.motoModel}>
                <Select
                  value={form.motoModel}
                  onValueChange={(v) => setForm({ ...form, motoModel: v })}
                  disabled={!form.motoBrand || modelsForBrand.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={form.motoBrand ? "Select a model" : "Select a brand first"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {modelsForBrand.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Version / variant (optional)">
                <Input
                  value={form.motoVariant}
                  onChange={(e) => setForm({ ...form, motoVariant: e.target.value })}
                  placeholder="Standard"
                />
              </Field>
              <Field label="Year model" error={errors.motoYear}>
                <Input
                  value={form.motoYear}
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    const year = Number(digits);
                    if (digits.length === 4 && year > new Date().getFullYear()) return;
                    setForm({ ...form, motoYear: digits });
                  }}
                  placeholder="2022"
                />
              </Field>
              <Field label="Plate number" error={errors.plateNumber}>
                <Input
                  value={form.plateNumber}
                  maxLength={20}
                  onChange={(e) => setForm({ ...form, plateNumber: e.target.value.toUpperCase() })}
                  placeholder="ABC 1234"
                />
              </Field>
            </div>
          </Section>

          <Section title="3. Select services" error={errors.services}>
            <div className="grid gap-3 md:grid-cols-2">
              {services.data?.map((s) => {
                const checked = serviceIds.includes(s.id);
                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() =>
                      setServiceIds((prev) =>
                        checked ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                      )
                    }
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-lg border p-4 text-left transition-colors",
                      checked
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card/50 hover:border-primary/50",
                    )}
                  >
                    <span>
                      <span className="font-display block tracking-wide uppercase">{s.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.duration_minutes} mins
                      </span>
                    </span>
                    <span className="font-display text-primary">{formatPHP(s.price)}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="4. Pick a schedule" error={errors.schedule}>
            {availability.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading available schedules...</p>
            ) : (
              <>
                <p className="mb-2 text-sm text-muted-foreground">
                  Available dates (Monday to Saturday)
                </p>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      disabled={!dates.length}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(parseISO(date), "PPPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(d) => {
                        if (!d) return;
                        const iso = format(d, "yyyy-MM-dd");
                        setDate(iso);
                        setStartTime("");
                      }}
                      disabled={(d) => {
                        const iso = format(d, "yyyy-MM-dd");
                        return !availableDateSet.has(iso);
                      }}
                      classNames={{
                        nav: "justify-between gap-1",
                        month_caption:
                          "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                {date && (
                  <>
                    <p className="mt-4 mb-2 text-sm text-muted-foreground">
                      Time slots for {formatDateLong(date)}
                    </p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {slots.map((slot) => (
                        <button
                          type="button"
                          key={slot.id}
                          disabled={slot.disabled}
                          onClick={() => setStartTime(slot.startTime)}
                          className={cn(
                            "rounded-lg border p-3 text-center transition-colors",
                            slot.disabled && "cursor-not-allowed opacity-40",
                            startTime === slot.startTime
                              ? "border-primary bg-primary/15"
                              : "border-border bg-card/50 hover:border-primary/50",
                          )}
                        >
                          <span className="font-display block">{formatTime(slot.startTime)}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {slot.disabled
                              ? "unavailable"
                              : `${slot.remaining} mechanic(s) available`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </Section>

          <Section title="5. Notes & terms" error={errors.terms}>
            <Textarea
              value={form.notes}
              maxLength={500}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Tell us about noises, symptoms or parts you already bought (optional)"
            />
            <div className="mt-4 rounded-lg border border-border bg-card/50 p-4 text-sm text-muted-foreground">
              <p className="font-display tracking-wide text-foreground uppercase">
                Terms and conditions
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Bookings are subject to shop confirmation.</li>
                <li>
                  Please arrive 15 minutes before your slot. Late arrivals beyond 30 minutes may be
                  rescheduled.
                </li>
                <li>
                  Quoted prices are starting rates; parts and additional labor are billed
                  separately.
                </li>
                <li>
                  Cancellations must be made at least {SHOP.noticeHours} hours before the schedule.
                </li>
                <li>The shop is not liable for personal items left on the unit.</li>
              </ul>
            </div>
            <label className="mt-4 flex items-start gap-3 text-sm">
              <Checkbox
                checked={terms}
                onCheckedChange={(v) => setTerms(v === true)}
                className="mt-0.5"
              />
              <span>I have read and accept the terms and conditions.</span>
            </label>
          </Section>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card/60 p-5">
            <div>
              <p className="text-xs tracking-widest text-muted-foreground uppercase">
                Estimated total
              </p>
              <p className="font-display text-3xl text-primary">{formatPHP(total)}</p>
              {selectedServices.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedServices.map((s) => (
                    <Badge key={s.id} variant="outline">
                      {s.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={mutation.isPending}
              className="font-display tracking-wide uppercase"
            >
              {mutation.isPending && <Loader2 className="animate-spin" />} Confirm booking
            </Button>
          </div>
        </form>
      </main>
      <SiteFooter />
    </div>
  );
}

function Section({
  title,
  error,
  children,
}: {
  title: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-card/40 p-6">
      <h2 className="font-display mb-4 text-xl tracking-wide uppercase">{title}</h2>
      {children}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
