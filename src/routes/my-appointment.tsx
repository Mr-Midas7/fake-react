import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelAppointment, lookupAppointment } from "@/lib/booking.functions";
import { formatDateLong, formatPHP, formatTime, statusLabel } from "@/lib/shop";

export const Route = createFileRoute("/my-appointment")({
  head: () => ({
    meta: [
      { title: "View or Cancel My Appointment | Fake Rider" },
      {
        name: "description",
        content:
          "Enter your reference code and mobile number to view your motorcycle service appointment or cancel it online.",
      },
      { property: "og:title", content: "Track your appointment | Fake Rider Motorparts" },
      {
        property: "og:description",
        content: "Check the status of your booking with your reference code.",
      },
    ],
  }),
  component: MyAppointment,
});

type Appt =
  Awaited<ReturnType<typeof lookupAppointment>> extends { appointment: infer A } ? A : never;

function MyAppointment() {
  const lookup = useServerFn(lookupAppointment);
  const cancel = useServerFn(cancelAppointment);
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [appt, setAppt] = useState<
    null | Extract<Awaited<ReturnType<typeof lookupAppointment>>, { ok: true }>["appointment"]
  >(null);

  const search = useMutation({
    mutationFn: () =>
      lookup({ data: { reference: reference.trim().toUpperCase(), phone: phone.trim() } }),
    onSuccess: (res) => {
      if (!res.ok) {
        setAppt(null);
        toast.error(res.error);
        return;
      }
      setAppt(res.appointment);
    },
    onError: () => toast.error("Please check your reference code and mobile number."),
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      cancel({ data: { reference: reference.trim().toUpperCase(), phone: phone.trim() } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Your appointment has been cancelled.");
      search.mutate();
    },
    onError: () => toast.error("We could not cancel the appointment. Please call the shop."),
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-12">
        <p className="text-xs tracking-[0.3em] text-accent uppercase">Appointment tracker</p>
        <h1 className="font-display text-4xl font-bold uppercase md:text-5xl">My appointment</h1>
        <p className="mt-2 text-muted-foreground">
          Enter the reference code you received when booking, together with the mobile number you
          used.
        </p>

        <form
          className="mt-8 grid gap-4 rounded-xl border border-border/70 bg-card/50 p-6 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            search.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>Reference code</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value.toUpperCase())}
              placeholder="FRM-XXXXXX"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mobile number</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09XXXXXXXXX"
            />
          </div>
          <Button type="submit" disabled={search.isPending} className="font-display uppercase">
            {search.isPending ? <Loader2 className="animate-spin" /> : <Search />} Find
          </Button>
        </form>

        {appt && (
          <Card className="mt-8 border-border/70 bg-card/60">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs tracking-widest text-muted-foreground uppercase">
                    Reference
                  </p>
                  <p className="font-display text-2xl tracking-widest text-primary">
                    {appt.reference}
                  </p>
                </div>
                <Badge variant="outline" className="uppercase">
                  {statusLabel(appt.status)}
                </Badge>
              </div>

              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                <Row label="Customer" value={appt.customerName} />
                <Row label="Mobile" value={appt.phone} />
                <Row
                  label="Schedule"
                  value={`${formatDateLong(appt.date)} at ${formatTime(appt.startTime)}`}
                />
                <Row label="Motorcycle" value={appt.motorcycle} />
                <Row label="Plate number" value={appt.plateNumber} />
                <Row label="Estimated total" value={formatPHP(appt.total)} />
              </dl>

              <div className="mt-5">
                <p className="text-xs tracking-widest text-muted-foreground uppercase">Services</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {appt.services.map((s) => (
                    <li
                      key={s.name}
                      className="flex justify-between border-b border-border/50 py-1"
                    >
                      <span>{s.name}</span>
                      <span className="text-primary">{formatPHP(s.price)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {appt.notes && (
                <p className="mt-4 text-sm text-muted-foreground">Notes: {appt.notes}</p>
              )}

              {!["cancelled", "completed"].includes(appt.status) && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="mt-6 font-display uppercase">
                      Cancel appointment
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This cannot be undone. You will need to book a new schedule, subject to
                        availability.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep it</AlertDialogCancel>
                      <AlertDialogAction onClick={() => cancelMutation.mutate()}>
                        Yes, cancel
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </CardContent>
          </Card>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-widest text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}
