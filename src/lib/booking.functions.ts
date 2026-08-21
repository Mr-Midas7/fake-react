import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { addDays, decodeBlockReason, earliestBookableDate, isSlotBookable } from "./shop";

const phoneSchema = z
  .string()
  .trim()
  .regex(/^(09\d{9}|\+639\d{9})$/, "Enter a valid PH mobile number (09XXXXXXXXX)");

const currentYear = new Date().getFullYear();

const bookingSchema = z.object({
  customerName: z.string().trim().min(2).max(80),
  phone: phoneSchema,
  email: z.string().trim().email().max(120).optional().or(z.literal("")),
  motoBrand: z.string().trim().min(1).max(50),
  motoModel: z.string().trim().min(1).max(50),
  motoVariant: z.string().trim().max(50).optional().or(z.literal("")),
  motoYear: z.number().int().min(1970).max(currentYear),
  plateNumber: z.string().trim().min(2).max(20),
  serviceIds: z.array(z.string().uuid()).min(1).max(6),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  termsAccepted: z.literal(true),
});

export type BookingInput = z.infer<typeof bookingSchema>;

function makeReference() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `FRM-${out}`;
}

/** Slot availability for a date range (Manila dates). */
export const getAvailability = createServerFn({ method: "GET" })
  .inputValidator((input: { days?: number; serviceIds?: string[] }) => ({
    days: Math.min(Math.max(input?.days ?? 45, 7), 90),
    serviceIds: input?.serviceIds ?? [],
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const from = earliestBookableDate();
    const to = addDays(from, data.days);

    const [slotsRes, blocksRes, apptsRes, servicesRes, schedulesRes, exceptionsRes] =
      await Promise.all([
        supabaseAdmin
          .from("time_slots")
          .select("id,start_time,end_time,capacity")
          .eq("is_active", true)
          .order("start_time"),
        supabaseAdmin
          .from("schedule_blocks")
          .select("block_date,start_time,reason")
          .gte("block_date", from)
          .lte("block_date", to),
        supabaseAdmin
          .from("appointments")
          .select("appointment_date,start_time,assigned_crew_id")
          .gte("appointment_date", from)
          .lte("appointment_date", to)
          .not("status", "in", "(cancelled,no_show)"),
        data.serviceIds.length > 0
          ? supabaseAdmin
              .from("services")
              .select("id,duration_minutes")
              .in("id", data.serviceIds)
              .eq("is_active", true)
          : { data: [] as { id: string; duration_minutes: number }[] },
        supabaseAdmin.from("crew_schedules").select("*"),
        supabaseAdmin
          .from("crew_availability_exceptions")
          .select("*")
          .gte("end_date", from)
          .lte("start_date", to),
      ]);

    // Calculate total service duration + 15 min buffer
    const totalDuration =
      (servicesRes.data ?? []).reduce((sum, s) => sum + (s.duration_minutes ?? 60), 0) + 15;

    const counts: Record<string, number> = {};
    for (const a of apptsRes.data ?? []) {
      const key = `${a.appointment_date}|${String(a.start_time).slice(0, 5)}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }

    return {
      from,
      to,
      totalDurationMinutes: totalDuration,
      slots: (slotsRes.data ?? []).map((s) => ({
        id: s.id,
        startTime: String(s.start_time).slice(0, 5),
        endTime: String(s.end_time).slice(0, 5),
        capacity: s.capacity,
      })),
      blocks: (blocksRes.data ?? []).map((b) => {
        const { endTime, userReason } = decodeBlockReason(b.reason);
        return {
          date: b.block_date,
          startTime: b.start_time ? String(b.start_time).slice(0, 5) : null,
          endTime,
          reason: userReason || null,
        };
      }),
      counts,
      schedules: schedulesRes.data ?? [],
      exceptions: exceptionsRes.data ?? [],
    };
  });

export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => bookingSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const startTime = data.startTime.slice(0, 5);
    const slotStartMin = parseInt(startTime.slice(0, 2)) * 60 + parseInt(startTime.slice(3, 5));

    const slot = await supabaseAdmin
      .from("time_slots")
      .select("id,capacity")
      .eq("start_time", `${startTime}:00`)
      .eq("is_active", true)
      .maybeSingle();
    if (!slot.data) return { ok: false as const, error: "That time slot is not available." };

    if (!isSlotBookable(data.date, startTime)) {
      return {
        ok: false as const,
        error: "This slot is no longer bookable. Please select a later time.",
      };
    }

    // --- Fetch services to calculate total duration + 15-min buffer ---
    const services = await supabaseAdmin
      .from("services")
      .select("id,name,price,duration_minutes")
      .in("id", data.serviceIds)
      .eq("is_active", true);
    if (!services.data?.length)
      return { ok: false as const, error: "Please select at least one available service." };

    const totalDuration =
      services.data.reduce((sum, s) => sum + (s.duration_minutes ?? 60), 0) + 15;

    const blocked = await supabaseAdmin
      .from("schedule_blocks")
      .select("id,start_time,reason")
      .eq("block_date", data.date);
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

    // 2. Get mechanics scheduled to work that date
    //    Date-specific schedules override weekly schedules.
    const [dy, dm, dd] = data.date.split("-").map(Number);
    const dow = new Date(Date.UTC(dy ?? 1970, (dm ?? 1) - 1, dd ?? 1)).getUTCDay();
    const schedulesRes = await supabaseAdmin
      .from("crew_schedules")
      .select("*")
      .or(
        `and(schedule_date.eq.${data.date},is_working.eq.true),and(day_of_week.eq.${dow},is_working.eq.true,schedule_date.is.null)`,
      )
      .order("schedule_date", { ascending: false, nullsFirst: false })
      .order("crew_id");

    if (!schedulesRes.data?.length) {
      return { ok: false as const, error: "No mechanics are scheduled to work on that day." };
    }

    // Deduplicate by crew_id, preferring date-specific schedules
    const crewSchedules = new Map<string, (typeof schedulesRes.data)[number]>();
    for (const s of schedulesRes.data) {
      if (!crewSchedules.has(s.crew_id)) crewSchedules.set(s.crew_id, s);
    }
    const effectiveSchedules = Array.from(crewSchedules.values());

    // 3. Get availability exceptions for that date
    const exceptionsRes = await supabaseAdmin
      .from("crew_availability_exceptions")
      .select("*")
      .lte("start_date", data.date)
      .gte("end_date", data.date);

    // 4. Check each mechanic for availability
    const availableMechanics: string[] = [];
    const existingApptsRes = await supabaseAdmin
      .from("appointments")
      .select("assigned_crew_id,start_time")
      .eq("appointment_date", data.date)
      .not("status", "in", "(cancelled,no_show)");

    const slotEndMin = slotStartMin + totalDuration;

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

      // Check existing appointments for the same mechanic at the same slot
      const hasConflict = (existingApptsRes.data ?? []).some(
        (a) =>
          a.assigned_crew_id === sched.crew_id && String(a.start_time).slice(0, 5) === startTime,
      );

      if (hasConflict) continue;

      availableMechanics.push(sched.crew_id);
    }

    if (!availableMechanics.length) {
      return {
        ok: false as const,
        error: "No mechanic is available at that time. Please pick another slot.",
      };
    }

    // 5. Auto-assign the first available mechanic
    const assignedMechanicId = availableMechanics[0] ?? null;

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

    const inserted = await supabaseAdmin
      .from("appointments")
      .insert({
        reference_code: reference,
        customer_name: data.customerName,
        phone: data.phone,
        email: data.email || null,
        moto_brand: data.motoBrand,
        moto_model: data.motoModel,
        moto_variant: data.motoVariant || null,
        moto_year: data.motoYear,
        plate_number: data.plateNumber.toUpperCase(),
        appointment_date: data.date,
        start_time: `${startTime}:00`,
        notes: data.notes || null,
        total_estimate: total,
        terms_accepted: true,
        assigned_crew_id: assignedMechanicId,
      })
      .select("id,reference_code")
      .single();

    if (inserted.error || !inserted.data) {
      return { ok: false as const, error: "We could not save your booking. Please try again." };
    }

    await supabaseAdmin.from("appointment_services").insert(
      services.data.map((s) => ({
        appointment_id: inserted.data.id,
        service_id: s.id,
        service_name: s.name,
        price: s.price,
      })),
    );

    await supabaseAdmin.from("notifications").insert({
      type: "new_appointment",
      title: `New booking ${reference}`,
      message: `${data.customerName} booked ${services.data.map((s) => s.name).join(", ")} on ${data.date}.`,
      appointment_id: inserted.data.id,
    });

    return { ok: true as const, reference, total };
  });

const lookupSchema = z.object({
  reference: z.string().trim().min(4).max(20),
  phone: phoneSchema,
});

async function findAppointment(reference: string, phone: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const res = await supabaseAdmin
    .from("appointments")
    .select(
      "id,reference_code,customer_name,phone,email,moto_brand,moto_model,moto_variant,moto_year,plate_number,appointment_date,start_time,status,notes,total_estimate,created_at,appointment_services(service_name,price)",
    )
    .eq("reference_code", reference.toUpperCase())
    .maybeSingle();
  if (!res.data || res.data.phone !== phone) return null;
  return res.data;
}

export const lookupAppointment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => lookupSchema.parse(input))
  .handler(async ({ data }) => {
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
  .inputValidator((input: unknown) => lookupSchema.parse(input))
  .handler(async ({ data }) => {
    const appt = await findAppointment(data.reference, data.phone);
    if (!appt)
      return {
        ok: false as const,
        error: "No appointment found for that reference code and mobile number.",
      };
    if (appt.status === "cancelled")
      return { ok: false as const, error: "This appointment is already cancelled." };
    if (["completed", "in_progress"].includes(appt.status)) {
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
