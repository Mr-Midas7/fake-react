import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { z } from "zod";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { TurnstileChallenge } from "@/components/site/turnstile-challenge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  type Availability,
  computeAvailableDates,
  computeAvailableSlots,
  computeFullyBookedDates,
} from "@/lib/availability";
import { createBooking, getAvailability } from "@/lib/booking.functions";
import {
  PHONE_VALIDATION_MESSAGE,
  SHOP,
  formatDateLong,
  formatPHP,
  formatTime,
  normalizePhilippineMobile,
  sanitizePhilippineMobileInput,
} from "@/lib/shop";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional(),
  serviceId: z.string().uuid().optional(),
});

const turnstileEnabled = Boolean(import.meta.env["VITE_TURNSTILE_SITE_KEY"]);

export const Route = createFileRoute("/book")({
  validateSearch: searchSchema,
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
  const search = useSearch({ from: "/book" });

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
  const [serviceIds, setServiceIds] = useState<string[]>(
    search.serviceId ? [search.serviceId] : [],
  );
  const [serviceCategory, setServiceCategory] = useState("all");
  const [date, setDate] = useState<string>(search.date ?? "");
  const [startTime, setStartTime] = useState<string>(search.startTime ?? "");
  const [terms, setTerms] = useState(false);
  const [mobileStep, setMobileStep] = useState(1);
  const [useManualMotorcycle, setUseManualMotorcycle] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [result, setResult] = useState<{ reference: string; total: number } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [bookingRequestId, setBookingRequestId] = useState(() => crypto.randomUUID());

  const services = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("is_active", true)
        .eq("is_archived", false)
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
        .eq("is_archived", false)
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

  const catalogUnavailable =
    motorcycleCatalog.isError || (!motorcycleCatalog.isLoading && brands.length === 0);
  const enterMotorcycleManually = useManualMotorcycle || catalogUnavailable;

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

  const availability = useQuery<Availability>({
    queryKey: ["availability", serviceIds],
    queryFn: () => availabilityFn({ data: { days: 45, serviceIds } }),
    enabled: serviceIds.length > 0,
  });

  const dates = useMemo(
    () => (availability.data ? computeAvailableDates(availability.data) : []),
    [availability.data],
  );

  const slots = useMemo(
    () => (availability.data && date ? computeAvailableSlots(availability.data, date) : []),
    [availability.data, date],
  );

  const availableDateSet = useMemo(() => new Set(dates), [dates]);
  const fullyBookedDates = useMemo(
    () => (availability.data ? computeFullyBookedDates(availability.data) : []),
    [availability.data],
  );

  const selectedDate = date ? parseISO(date) : undefined;
  const availabilityError = availability.data?.error;

  const selectedServices = (services.data ?? []).filter((s) => serviceIds.includes(s.id));
  const serviceCategories = useMemo(
    () =>
      Array.from(
        new Set((services.data ?? []).map((service) => service.category).filter(Boolean)),
      ).sort(),
    [services.data],
  );
  const filteredServices = (services.data ?? []).filter(
    (service) => serviceCategory === "all" || service.category === serviceCategory,
  );
  const total = selectedServices.reduce((sum, s) => sum + Number(s.price), 0);
  const totalDuration = selectedServices.reduce(
    (sum, service) => sum + (service.duration_minutes ?? 60) + 15,
    0,
  );

  useEffect(() => {
    if (!availability.data || !date) return;

    if (!availableDateSet.has(date)) {
      setDate("");
      setStartTime("");
      return;
    }

    if (startTime) {
      const selectedSlot = computeAvailableSlots(availability.data, date).find(
        (slot) => slot.startTime === startTime,
      );
      if (!selectedSlot || selectedSlot.disabled) setStartTime("");
    }
  }, [availability.data, availableDateSet, date, startTime]);

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
          turnstileToken,
          idempotencyKey: bookingRequestId,
          termsAccepted: true as const,
        },
      });
      return res;
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        setTurnstileToken("");
        setBookingRequestId(crypto.randomUUID());
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

  function validationErrors(steps: number[]) {
    const e: Errors = {};
    if (steps.includes(1)) {
      if (form.customerName.trim().length < 2) e.customerName = "Please enter your full name.";
      if (!normalizePhilippineMobile(form.phone)) e.phone = PHONE_VALIDATION_MESSAGE;
      if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim()))
        e.email = "Enter a valid email address.";
    }
    if (steps.includes(2)) {
      if (!form.motoBrand.trim()) e.motoBrand = "Required";
      if (!form.motoModel.trim()) e.motoModel = "Required";
      const year = Number(form.motoYear);
      if (!year || year < 1970 || year > new Date().getFullYear())
        e.motoYear = "Enter a valid year";
      if (form.plateNumber.trim().length < 2) e.plateNumber = "Required";
    }
    if (steps.includes(3) && serviceIds.length === 0) e.services = "Select at least one service.";
    if (steps.includes(4) && (!date || !startTime)) e.schedule = "Pick a date and time slot.";
    if (steps.includes(5) && !terms) e.terms = "You must accept the terms and conditions.";
    return e;
  }

  function validate() {
    const e = validationErrors([1, 2, 3, 4, 5]);
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function continueMobileBooking() {
    const e = validationErrors([mobileStep]);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast.error("Please complete the highlighted fields.");
      return;
    }
    setMobileStep((step) => Math.min(step + 1, 6));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBackMobileBooking() {
    setErrors({});
    setMobileStep((step) => Math.max(step - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submitBooking() {
    if (validate()) mutation.mutate();
    else toast.error("Please complete the highlighted fields.");
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

        <div className="mt-6 md:hidden">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Step {mobileStep} of 6</span>
            <span>
              {
                [
                  "Your details",
                  "Motorcycle details",
                  "Select services",
                  "Pick a schedule",
                  "Terms",
                  "Review",
                ][mobileStep - 1]
              }
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${(mobileStep / 6) * 100}%` }}
            />
          </div>
        </div>

        <form
          className="mt-10 space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            if (window.matchMedia("(min-width: 768px)").matches || mobileStep === 6) {
              submitBooking();
            } else {
              continueMobileBooking();
            }
          }}
        >
          <Section title="1. Your details" className={cn(mobileStep !== 1 && "hidden", "md:block")}>
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
                  type="tel"
                  value={form.phone}
                  maxLength={11}
                  inputMode="tel"
                  autoComplete="tel"
                  onChange={(e) => {
                    setForm({ ...form, phone: sanitizePhilippineMobileInput(e.target.value) });
                  }}
                  placeholder="09171234567"
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
            <WizardActions onContinue={continueMobileBooking} />
          </Section>

          <Section
            title="2. Motorcycle details"
            className={cn(mobileStep !== 2 && "hidden", "md:block")}
          >
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="md:col-span-2 lg:col-span-3">
                {catalogUnavailable ? (
                  <p className="text-sm text-muted-foreground">
                    The motorcycle catalog is unavailable, so please enter your unit details below.
                  </p>
                ) : (
                  <label className="flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={useManualMotorcycle}
                      onCheckedChange={(value) => setUseManualMotorcycle(value === true)}
                    />
                    <span>My motorcycle isn&apos;t listed</span>
                  </label>
                )}
              </div>

              {enterMotorcycleManually ? (
                <>
                  <Field label="Brand" error={errors.motoBrand}>
                    <Input
                      value={form.motoBrand}
                      maxLength={50}
                      onChange={(e) => setForm({ ...form, motoBrand: e.target.value })}
                      placeholder="e.g. Yamaha"
                    />
                  </Field>
                  <Field label="Model" error={errors.motoModel}>
                    <Input
                      value={form.motoModel}
                      maxLength={50}
                      onChange={(e) => setForm({ ...form, motoModel: e.target.value })}
                      placeholder="e.g. NMAX 155"
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Brand" error={errors.motoBrand}>
                    <Select
                      value={form.motoBrand}
                      onValueChange={(v) => setForm({ ...form, motoBrand: v, motoModel: "" })}
                      disabled={motorcycleCatalog.isLoading}
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
                </>
              )}
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
            <WizardActions onBack={goBackMobileBooking} onContinue={continueMobileBooking} />
          </Section>

          <Section
            title="3. Select services"
            error={errors.services}
            className={cn(mobileStep !== 3 && "hidden", "md:block")}
          >
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Label htmlFor="booking-service-category">Service category</Label>
              <Select value={serviceCategory} onValueChange={setServiceCategory}>
                <SelectTrigger id="booking-service-category" className="w-full sm:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {serviceCategories.map((category) => (
                    <SelectItem key={category} value={category} className="capitalize">
                      {category.replace(/[-_]/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {filteredServices.map((s) => {
                const checked = serviceIds.includes(s.id);
                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => {
                      setServiceIds((prev) =>
                        checked ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                      );
                      setDate("");
                      setStartTime("");
                    }}
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
            {filteredServices.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                No services are available in this category.
              </p>
            )}
            <p className="mt-3 text-sm text-muted-foreground">
              Not sure which service to choose?{" "}
              <Link
                to="/services"
                className="font-medium text-primary underline underline-offset-4"
              >
                Browse our services
              </Link>{" "}
              for details to understand what each service includes.
            </p>
            {selectedServices.length > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {totalDuration} minutes reserved
                </span>{" "}
                including a 15-minute buffer for each selected service.
              </p>
            )}
            <WizardActions onBack={goBackMobileBooking} onContinue={continueMobileBooking} />
          </Section>

          <Section
            title="4. Pick a schedule"
            error={errors.schedule}
            className={cn(mobileStep !== 4 && "hidden", "md:block")}
          >
            {serviceIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Select at least one service first so we can calculate available dates and times.
              </p>
            ) : availability.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading available schedules...</p>
            ) : availability.isError || availabilityError ? (
              <p className="text-sm text-destructive">
                {availabilityError ??
                  "We could not load availability. Please refresh and try again."}
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm text-muted-foreground">
                  Available dates (Monday to Saturday). Dates with no remaining mechanic capacity
                  are marked Fully Booked.
                </p>

                <div className="w-full overflow-x-auto rounded-lg border border-border bg-card/50 p-2">
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

                <div className="mt-4">
                  <p className="mb-2 text-sm text-muted-foreground">
                    {date
                      ? `Time slots for ${formatDateLong(date)}`
                      : "Choose a date above to view available time slots."}
                  </p>
                  {date ? (
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
                            {slot.disabled ? "Unavailable" : "Available"}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                      Time slots will appear here after you choose a date.
                    </div>
                  )}
                </div>
              </>
            )}
            <WizardActions onBack={goBackMobileBooking} onContinue={continueMobileBooking} />
          </Section>

          <Section
            title="5. Terms and conditions"
            error={errors.terms}
            className={cn(mobileStep !== 5 && "hidden", "md:block")}
          >
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
                <li>
                  We use your name, contact details, motorcycle details, selected services, and
                  notes only to manage this booking, contact you about it, and provide shop
                  services. We do not sell your information.
                </li>
              </ul>
            </div>
            <label className="mt-4 flex items-start gap-3 text-sm">
              <Checkbox
                checked={terms}
                onCheckedChange={(v) => setTerms(v === true)}
                className="mt-0.5"
              />
              <span>
                I accept the terms and conditions and consent to the collection and use of my
                booking information as described above.
              </span>
            </label>
            <WizardActions onBack={goBackMobileBooking} onContinue={continueMobileBooking} />
          </Section>

          <div
            className={cn(
              "flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card/60 p-5",
              mobileStep !== 6 && "hidden md:flex",
            )}
          >
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
              <p className="mt-2 text-xs text-muted-foreground">
                Final availability is checked again when you confirm your booking.
              </p>
            </div>
            <div className="w-full space-y-4 md:w-auto">
              <TurnstileChallenge resetKey={bookingRequestId} onToken={setTurnstileToken} />
              <div className="flex justify-between gap-3 md:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="md:hidden"
                  onClick={goBackMobileBooking}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  disabled={mutation.isPending || (turnstileEnabled && !turnstileToken)}
                  className="font-display tracking-wide uppercase"
                >
                  {mutation.isPending && <Loader2 className="animate-spin" />} Confirm booking
                </Button>
              </div>
            </div>
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
  className,
  children,
}: {
  title: string;
  error?: string | undefined;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-border/70 bg-card/40 p-6", className)}>
      <h2 className="font-display mb-4 text-xl tracking-wide uppercase">{title}</h2>
      {children}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}

function WizardActions({ onBack, onContinue }: { onBack?: () => void; onContinue: () => void }) {
  return (
    <div className="mt-6 flex justify-between gap-3 md:hidden">
      {onBack ? (
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button type="button" onClick={onContinue} className="font-display uppercase">
        Continue
      </Button>
    </div>
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
