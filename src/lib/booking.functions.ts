import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { buildPublicAvailability } from "./availability";
import {
  addDays,
  buildBookingTimeSlots,
  decodeBlockReason,
  earliestBookableDate,
  intervalsOverlap,
  isBookingStartTime,
  isShopOpenDate,
  isSlotBookable,
  phoneSchema,
  REFERENCE_CODE_PATTERN,
  normalizeReferenceCode,
  timeToMinutes,
} from "./shop";

const currentYear = new Date().getFullYear();

const availabilitySchema = z.object({
  days: z.number().int().min(7).max(90).default(45),
  serviceIds: z
    .array(z.string().uuid())
    .max(6)
    .refine((ids) => new Set(ids).size === ids.length, "Services must be unique")
    .default([]),
});

const bookingSchema = z.object({
  customerName: z.string().trim().min(2).max(80),
  phone: phoneSchema,
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  motoBrand: z.string().trim().min(1).max(50),
  motoModel: z.string().trim().min(1).max(50),
  motoVariant: z.string().trim().max(50).optional().or(z.literal("")),
  motoYear: z.number().int().min(1970).max(currentYear),
  plateNumber: z.string().trim().min(2).max(20),
  serviceIds: z
    .array(z.string().uuid())
    .min(1)
    .max(6)
    .refine((ids) => new Set(ids).size === ids.length, "Services must be unique"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  turnstileToken: z.string().trim().max(2048).default(""),
  idempotencyKey: z.string().uuid(),
  termsAccepted: z.literal(true),
});

export type BookingInput = z.infer<typeof bookingSchema>;

function unavailableAvailability(from: string, to: string, error: string) {
  return {
    from,
    to,
    error,
    totalDurationMinutes: 75,
    dates: [],
    fullyBookedDates: [],
    slotsByDate: {},
  };
}

function availabilityErrorMessage(errors: Array<{ message: string } | null>) {
  const message = errors
    .filter((error): error is { message: string } => !!error)
    .map((error) => error.message)
    .join(" ");

  if (
    /booking_duration_minutes|appointment_services.*duration_minutes|schedule_date/i.test(message)
  ) {
    return "Booking capacity setup is incomplete. The shop needs to apply its scheduling database update.";
  }

  return "We could not load booking availability. Please try again shortly.";
}

function makeReference() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `FRM-${out}`;
}

function getClientIp() {
  const request = getRequest();
  const platformIp =
    request?.headers.get("x-vercel-forwarded-for")?.trim() ||
    request?.headers.get("cf-connecting-ip")?.trim();
  const forwarded = request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return platformIp || forwarded || request?.headers.get("x-real-ip")?.trim() || "unknown";
}

async function hashRateLimitSubject(subject: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(subject));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Persistent, per-endpoint limits. The database function serializes increments,
 * so this also works when the app runs across multiple serverless instances.
 */
async function isPublicRequestAllowed(
  scope: "availability" | "booking" | "lookup" | "cancellation",
  maxRequests: number,
  windowSeconds: number,
  subject?: string,
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const subjects = [await hashRateLimitSubject(`ip:${getClientIp()}`)];
    if (subject) subjects.push(await hashRateLimitSubject(`subject:${subject}`));

    for (const opaqueSubject of subjects) {
      const { data, error } = await supabaseAdmin.rpc("enforce_public_rate_limit", {
        p_scope: scope,
        p_subject: opaqueSubject,
        p_limit: maxRequests,
        p_window_seconds: windowSeconds,
      });
      if (error) {
        console.error(`[Rate limit] ${scope} check failed`, error);
        return false;
      }
      if (data !== true) return false;
    }
    return true;
  } catch (error) {
    console.error(`[Rate limit] ${scope} check failed`, error);
    return false;
  }
}

async function isTurnstileVerificationValid(token: string, idempotencyKey: string) {
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  if (!secret) return true;
  if (!token) return false;

  try {
    const body = new FormData();
    body.set("secret", secret);
    body.set("response", token);
    body.set("idempotency_key", idempotencyKey);
    const ip = getClientIp();
    if (ip !== "unknown") body.set("remoteip", ip);

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const result = (await response.json()) as { success?: unknown; action?: unknown };
    return response.ok && result.success === true && result.action === "booking";
  } catch (error) {
    console.error("[Turnstile] booking verification failed", error);
    return false;
  }
}

/** Slot availability for a date range (Manila dates). */
export const getAvailability = createServerFn({ method: "GET" })
  .validator((input: unknown) => availabilitySchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const from = earliestBookableDate();
    const to = addDays(from, data.days);
    const supabaseModule = await import("@/integrations/supabase/client.server").catch((error) => {
      console.error("[Booking availability] Supabase configuration failed", error);
      return null;
    });
    if (!supabaseModule) {
      return unavailableAvailability(
        from,
        to,
        "Booking availability is temporarily unavailable. Please try again shortly.",
      );
    }
    const { supabaseAdmin } = supabaseModule;

    if (!(await isPublicRequestAllowed("availability", 60, 60))) {
      return unavailableAvailability(
        from,
        to,
        "Too many availability checks. Please try again shortly.",
      );
    }

    const [slotsRes, blocksRes, apptsRes, servicesRes, schedulesRes, activeCrewRes, exceptionsRes] =
      await Promise.all([
        supabaseAdmin
          .from("time_slots")
          .select("id,start_time,end_time,capacity")
          .eq("is_active", true)
          .order("start_time"),
        supabaseAdmin
          .from("schedule_blocks")
          .select("block_date,start_time,reason")
          .eq("is_active", true)
          .gte("block_date", from)
          .lte("block_date", to),
        supabaseAdmin
          .from("appointments")
          .select("appointment_date,start_time,assigned_crew_id,booking_duration_minutes")
          .eq("is_archived", false)
          .gte("appointment_date", from)
          .lte("appointment_date", to)
          .not("status", "in", "(cancelled,no_show)"),
        data.serviceIds.length > 0
          ? supabaseAdmin
              .from("services")
              .select("id,duration_minutes")
              .in("id", data.serviceIds)
              .eq("is_active", true)
          : { data: [] as { id: string; duration_minutes: number }[], error: null },
        supabaseAdmin
          .from("crew_schedules")
          .select("*")
          .gte("schedule_date", from)
          .lte("schedule_date", to),
        supabaseAdmin.from("crew_members").select("id").eq("is_active", true),
        supabaseAdmin
          .from("crew_availability_exceptions")
          .select("*")
          .gte("end_date", from)
          .lte("start_date", to),
      ]);

    if (
      slotsRes.error ||
      blocksRes.error ||
      apptsRes.error ||
      servicesRes.error ||
      schedulesRes.error ||
      activeCrewRes.error ||
      exceptionsRes.error
    ) {
      const errors = [
        slotsRes.error,
        blocksRes.error,
        apptsRes.error,
        servicesRes.error,
        schedulesRes.error,
        activeCrewRes.error,
        exceptionsRes.error,
      ];
      console.error("[Booking availability] database query failed", errors);
      return unavailableAvailability(from, to, availabilityErrorMessage(errors));
    }

    if (
      data.serviceIds.length > 0 &&
      (servicesRes.data?.length ?? 0) !== new Set(data.serviceIds).size
    ) {
      return unavailableAvailability(
        from,
        to,
        "One or more selected services are no longer available. Please choose a different service.",
      );
    }

    // Each selected service reserves its own 15-minute cleanup / handoff buffer.
    const totalDuration = (servicesRes.data ?? []).reduce(
      (sum, service) => sum + (service.duration_minutes ?? 60) + 15,
      0,
    );

    const assignments: {
      date: string;
      startTime: string;
      durationMinutes: number;
      crewId: string | null;
    }[] = [];
    for (const a of apptsRes.data ?? []) {
      assignments.push({
        date: a.appointment_date,
        startTime: String(a.start_time).slice(0, 5),
        durationMinutes: a.booking_duration_minutes ?? 75,
        crewId: a.assigned_crew_id,
      });
    }

    const capacityConfig = (slotsRes.data ?? []).map((slot) => ({
      startTime: String(slot.start_time).slice(0, 5),
      capacity: slot.capacity,
    }));

    return buildPublicAvailability({
      from,
      to,
      totalDurationMinutes: totalDuration || 75,
      slots: buildBookingTimeSlots(capacityConfig),
      blocks: (blocksRes.data ?? []).map((b) => {
        const { endTime, userReason } = decodeBlockReason(b.reason);
        return {
          date: b.block_date,
          startTime: b.start_time ? String(b.start_time).slice(0, 5) : null,
          endTime,
          reason: userReason || null,
        };
      }),
      assignments,
      schedules: schedulesRes.data ?? [],
      activeCrewIds: (activeCrewRes.data ?? []).map((crew) => crew.id),
      exceptions: exceptionsRes.data ?? [],
    });
  });

export const createBooking = createServerFn({ method: "POST" })
  .validator((input: unknown) => bookingSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // A retry after a lost response must return the original reservation instead
    // of consuming another slot or requiring a previously used challenge token.
    const existingRequest = await supabaseAdmin
      .from("appointments")
      .select("reference_code,total_estimate")
      .eq("booking_request_id", data.idempotencyKey)
      .maybeSingle();
    if (existingRequest.error) {
      return {
        ok: false as const,
        error: "We could not verify this booking request. Please try again.",
      };
    }
    if (existingRequest.data) {
      return {
        ok: true as const,
        reference: existingRequest.data.reference_code,
        total: Number(existingRequest.data.total_estimate),
      };
    }

    if (!(await isPublicRequestAllowed("booking", 5, 15 * 60, data.phone))) {
      return {
        ok: false as const,
        error: "Too many booking attempts. Please wait a few minutes before trying again.",
      };
    }

    if (!(await isTurnstileVerificationValid(data.turnstileToken, data.idempotencyKey))) {
      return {
        ok: false as const,
        error: "Security verification failed. Please complete the challenge and try again.",
      };
    }

    const startTime = data.startTime.slice(0, 5);
    const slotStartMin = timeToMinutes(startTime);

    const isBlocked = await supabaseAdmin
      .from("blocked_numbers")
      .select("id")
      .ilike("phone", data.phone)
      .eq("is_archived", false)
      .maybeSingle();
    if (isBlocked.data) {
      return {
        ok: false as const,
        error:
          "This number has been blocked from booking online due to previous violations. Please contact the shop directly.",
      };
    }

    if (!isBookingStartTime(startTime)) {
      return {
        ok: false as const,
        error: "Choose a booking start time from 8:00 AM to 4:30 PM in 30-minute intervals.",
      };
    }

    if (!isShopOpenDate(data.date)) {
      return {
        ok: false as const,
        error: "Bookings are available Monday through Saturday only.",
      };
    }

    const slotConfigRes = await supabaseAdmin
      .from("time_slots")
      .select("start_time,capacity")
      .eq("is_active", true);
    if (slotConfigRes.error) {
      return { ok: false as const, error: "We could not verify that time slot. Please try again." };
    }
    const slot = buildBookingTimeSlots(
      (slotConfigRes.data ?? []).map((configuredSlot) => ({
        startTime: String(configuredSlot.start_time).slice(0, 5),
        capacity: configuredSlot.capacity,
      })),
    ).find((configuredSlot) => configuredSlot.startTime === startTime);
    if (!slot || slot.capacity <= 0)
      return { ok: false as const, error: "That time slot is not available." };

    if (!isSlotBookable(data.date, startTime)) {
      return {
        ok: false as const,
        error: "This slot is no longer bookable. Please select a later time.",
      };
    }

    // --- Fetch services to calculate service duration + buffer per service ---
    const services = await supabaseAdmin
      .from("services")
      .select("id,name,price,duration_minutes")
      .in("id", data.serviceIds)
      .eq("is_active", true);
    if (
      services.error ||
      !services.data?.length ||
      services.data.length !== data.serviceIds.length
    ) {
      return { ok: false as const, error: "Please select available services and try again." };
    }

    const totalDuration = services.data.reduce(
      (sum, service) => sum + (service.duration_minutes ?? 60) + 15,
      0,
    );

    const blocked = await supabaseAdmin
      .from("schedule_blocks")
      .select("id,start_time,reason")
      .eq("block_date", data.date)
      .eq("is_active", true);
    if (blocked.error) {
      return {
        ok: false as const,
        error: "We could not verify the shop schedule. Please try again.",
      };
    }
    if (
      (blocked.data ?? []).some((b) => {
        if (!b.start_time) return true; // whole-day block
        const { endTime } = decodeBlockReason(b.reason);
        const bs = String(b.start_time).slice(0, 5);
        const bsMin = parseInt(bs.slice(0, 2)) * 60 + parseInt(bs.slice(3, 5));
        const beMin = endTime
          ? parseInt(endTime.slice(0, 2)) * 60 + parseInt(endTime.slice(3, 5))
          : bsMin;
        // Overlap: appointment [slotStartMin, slotStartMin+totalDuration] overlaps block [bsMin, beMin]
        return slotStartMin < beMin && slotStartMin + totalDuration > bsMin;
      })
    ) {
      return {
        ok: false as const,
        error: "The shop is closed for that schedule. Please pick another one.",
      };
    }

    // 2. Prefer mechanics explicitly assigned to work on that date. When there
    //    is no date-specific assignment, active crew provide normal coverage.
    const schedulesRes = await supabaseAdmin
      .from("crew_schedules")
      .select("*")
      .eq("schedule_date", data.date)
      .order("crew_id");
    if (schedulesRes.error) {
      return {
        ok: false as const,
        error: "We could not verify mechanic availability. Please try again.",
      };
    }

    const dateSchedules = schedulesRes.data ?? [];
    let effectiveSchedules: {
      crew_id: string;
      start_time: string | null;
      end_time: string | null;
    }[] = dateSchedules.filter((schedule) => schedule.is_working);

    if (dateSchedules.length === 0) {
      const activeCrewRes = await supabaseAdmin
        .from("crew_members")
        .select("id")
        .eq("is_active", true)
        .order("id");
      if (activeCrewRes.error) {
        return {
          ok: false as const,
          error: "We could not verify mechanic availability. Please try again.",
        };
      }
      effectiveSchedules = (activeCrewRes.data ?? []).map((crew) => ({
        crew_id: crew.id,
        start_time: "08:00:00",
        end_time: "17:00:00",
      }));
    }

    if (!effectiveSchedules.length) {
      return { ok: false as const, error: "No mechanics are scheduled to work on that day." };
    }

    // 3. Get availability exceptions for that date
    const exceptionsRes = await supabaseAdmin
      .from("crew_availability_exceptions")
      .select("*")
      .lte("start_date", data.date)
      .gte("end_date", data.date);
    if (exceptionsRes.error) {
      return {
        ok: false as const,
        error: "We could not verify mechanic availability. Please try again.",
      };
    }

    // 4. Check each mechanic for availability
    const availableMechanics: string[] = [];
    const existingApptsRes = await supabaseAdmin
      .from("appointments")
      .select("assigned_crew_id,start_time,booking_duration_minutes")
      .eq("appointment_date", data.date)
      .eq("is_archived", false)
      .not("status", "in", "(cancelled,no_show)");
    if (existingApptsRes.error) {
      return {
        ok: false as const,
        error: "We could not verify mechanic availability. Please try again.",
      };
    }

    const slotEndMin = slotStartMin + totalDuration;
    const overlappingAppointments = (existingApptsRes.data ?? []).filter((appointment) => {
      const appointmentStartMin = timeToMinutes(String(appointment.start_time).slice(0, 5));
      return intervalsOverlap(
        slotStartMin,
        slotEndMin,
        appointmentStartMin,
        appointmentStartMin + (appointment.booking_duration_minutes ?? 75),
      );
    });
    const occupiedCrewIds = new Set(
      overlappingAppointments.flatMap((appointment) =>
        appointment.assigned_crew_id ? [appointment.assigned_crew_id] : [],
      ),
    );
    const unassignedAppointments = overlappingAppointments.filter(
      (appointment) => !appointment.assigned_crew_id,
    ).length;

    for (const sched of effectiveSchedules) {
      // Check shift covers the slot
      const shiftStart = String(sched.start_time).slice(0, 5);
      const shiftEnd = String(sched.end_time).slice(0, 5);
      const shiftStartMin =
        parseInt(shiftStart.slice(0, 2)) * 60 + parseInt(shiftStart.slice(3, 5));
      const shiftEndMin = parseInt(shiftEnd.slice(0, 2)) * 60 + parseInt(shiftEnd.slice(3, 5));

      if (slotStartMin < shiftStartMin || slotEndMin > shiftEndMin) continue; // Outside shift

      // Check exceptions
      const hasException = (exceptionsRes.data ?? []).some((e) => {
        if (e.crew_id !== sched.crew_id) return false;
        if (e.is_all_day) return true;
        if (e.start_time && e.end_time) {
          const excStart = String(e.start_time).slice(0, 5);
          const excEnd = String(e.end_time).slice(0, 5);
          const excStartMin = parseInt(excStart.slice(0, 2)) * 60 + parseInt(excStart.slice(3, 5));
          const excEndMin = parseInt(excEnd.slice(0, 2)) * 60 + parseInt(excEnd.slice(3, 5));
          // Check if the slot overlaps with the exception window
          if (slotStartMin < excEndMin && slotEndMin > excStartMin) return true;
        }
        return false;
      });

      if (hasException) continue;

      if (occupiedCrewIds.has(sched.crew_id)) continue;

      availableMechanics.push(sched.crew_id);
    }

    const remainingCapacity =
      Math.min(slot.capacity, availableMechanics.length) - unassignedAppointments;
    if (remainingCapacity <= 0) {
      return {
        ok: false as const,
        error: "No mechanic is available at that time. Please pick another slot.",
      };
    }

    // 5. Auto-assign an available mechanic, reserving capacity for legacy
    //    appointments that have not yet been assigned to a crew member.
    const assignedMechanicId = availableMechanics[unassignedAppointments] ?? null;

    const total = services.data.reduce((sum, s) => sum + Number(s.price), 0);

    let reference = makeReference();
    for (let attempt = 0; attempt < 4; attempt++) {
      const existing = await supabaseAdmin
        .from("appointments")
        .select("id")
        .eq("reference_code", reference)
        .maybeSingle();
      if (!existing.data) break;
      reference = makeReference();
    }

    const inserted = await supabaseAdmin.rpc("create_booking_atomic", {
      p_reference_code: reference,
      p_booking_request_id: data.idempotencyKey,
      p_customer_name: data.customerName,
      p_phone: data.phone,
      p_email: data.email || null,
      p_moto_brand: data.motoBrand,
      p_moto_model: data.motoModel,
      p_moto_variant: data.motoVariant || null,
      p_moto_year: data.motoYear,
      p_plate_number: data.plateNumber.toUpperCase(),
      p_appointment_date: data.date,
      p_start_time: `${startTime}:00`,
      p_notes: data.notes || null,
      p_total_estimate: total,
      p_booking_duration_minutes: totalDuration,
      p_assigned_crew_id: assignedMechanicId,
      p_services: services.data.map((service) => ({
        service_id: service.id,
        service_name: service.name,
        price: service.price,
        duration_minutes: service.duration_minutes ?? 60,
      })),
      p_notification_title: `New booking ${reference}`,
      p_notification_message: `${data.customerName} booked ${services.data.map((service) => service.name).join(", ")} on ${data.date}.`,
    });

    if (inserted.error?.code === "23P01") {
      return {
        ok: false as const,
        error: "That time was just booked. Please choose another available slot.",
      };
    }

    if (inserted.error || !inserted.data) {
      return { ok: false as const, error: "We could not save your booking. Please try again." };
    }

    return { ok: true as const, reference: inserted.data[0]?.reference_code ?? reference, total };
  });

const lookupSchema = z.object({
  reference: z
    .string()
    .trim()
    .regex(REFERENCE_CODE_PATTERN, "Enter a valid reference code in the format FRM-XXXXXX.")
    .transform(normalizeReferenceCode),
  phone: phoneSchema,
});

async function findAppointment(reference: string, phone: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const res = await supabaseAdmin
    .from("appointments")
    .select(
      "id,reference_code,customer_name,phone,email,moto_brand,moto_model,moto_variant,moto_year,plate_number,appointment_date,start_time,status,notes,total_estimate,created_at,appointment_services(service_name,price)",
    )
    .eq("reference_code", normalizeReferenceCode(reference))
    .maybeSingle();
  if (!res.data || res.data.phone !== phone) return null;
  return res.data;
}

export const lookupAppointment = createServerFn({ method: "POST" })
  .validator((input: unknown) => lookupSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await isPublicRequestAllowed("lookup", 12, 10 * 60, data.phone))) {
      return {
        ok: false as const,
        error: "Too many lookup attempts. Please wait a few minutes before trying again.",
      };
    }

    const appt = await findAppointment(data.reference, data.phone);
    if (!appt)
      return {
        ok: false as const,
        error: "No appointment found for that reference code and mobile number.",
      };
    return {
      ok: true as const,
      appointment: {
        reference: appt.reference_code,
        customerName: appt.customer_name,
        phone: appt.phone,
        motorcycle: [appt.moto_brand, appt.moto_model, appt.moto_variant, appt.moto_year]
          .filter(Boolean)
          .join(" "),
        plateNumber: appt.plate_number,
        date: appt.appointment_date,
        startTime: String(appt.start_time).slice(0, 5),
        status: appt.status,
        notes: appt.notes,
        total: Number(appt.total_estimate),
        services: (appt.appointment_services ?? []).map((s) => ({
          name: s.service_name,
          price: Number(s.price),
        })),
      },
    };
  });

export const cancelAppointment = createServerFn({ method: "POST" })
  .validator((input: unknown) => lookupSchema.parse(input))
  .handler(async ({ data }) => {
    if (!(await isPublicRequestAllowed("cancellation", 3, 15 * 60, data.phone))) {
      return {
        ok: false as const,
        error: "Too many cancellation attempts. Please wait a few minutes before trying again.",
      };
    }

    const appt = await findAppointment(data.reference, data.phone);
    if (!appt)
      return {
        ok: false as const,
        error: "No appointment found for that reference code and mobile number.",
      };
    if (!["pending", "confirmed"].includes(appt.status)) {
      return {
        ok: false as const,
        error: "This appointment can no longer be cancelled online. Please call the shop.",
      };
    }
    if (!isSlotBookable(appt.appointment_date, String(appt.start_time).slice(0, 5))) {
      return {
        ok: false as const,
        error: "Cancellations need 48 hours notice. Please call the shop instead.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("appointments")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", appt.id);
    if (error) throw error;
    await supabaseAdmin.from("notifications").insert({
      type: "cancelled_appointment",
      title: `Cancelled ${appt.reference_code}`,
      message: `${appt.customer_name} cancelled their ${appt.appointment_date} appointment.`,
      appointment_id: appt.id,
    });
    return { ok: true as const };
  });
