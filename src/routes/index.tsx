import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarCheck,
  Clock,
  ExternalLink,
  MapPin,
  Phone,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import famImage from "@/assets/fam-image.jpg.asset.json";
import logo from "@/assets/logo-shp.png.asset.json";
import { ProductCard } from "@/components/site/product-card";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { SHOP, formatPHP } from "@/lib/shop";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fake Rider Motorparts | Motorcycle Service Booking" },
      {
        name: "description",
        content:
          "Book motorcycle service online with Fake Rider Motorparts. Premium parts, accessories and race-grade mechanics with 48-hour advance scheduling.",
      },
      { property: "og:title", content: "Fake Rider Motorparts" },
      {
        property: "og:description",
        content:
          "Premium motorparts, accessories and race-grade motorcycle service. Book your slot online.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const featured = useQuery({
    queryKey: ["featured-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .neq("category", "motorcycle")
        .order("is_featured", { ascending: false })
        .order("sort_order")
        .limit(8);
      if (error) throw error;
      return Array.from(new Map((data ?? []).map((p) => [p.name.trim(), p])).values());
    },
  });

  const services = useQuery({
    queryKey: ["home-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("is_active", true)
        .order("sort_order")
        .limit(6);
      if (error) throw error;
      return Array.from(new Map((data ?? []).map((s) => [s.name.trim(), s])).values());
    },
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        <section className="relative overflow-hidden">
          <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
            <div>
              <Badge className="mb-4 bg-accent/15 text-accent uppercase" variant="outline">
                Local Pit Stop &middot; Philippines
              </Badge>
              <h1 className="font-display text-5xl leading-[0.95] font-extrabold uppercase md:text-7xl">
                Ride Hard.
                <span className="text-gradient-race block">Service Harder.</span>
              </h1>
              <p className="mt-5 max-w-lg text-base text-muted-foreground">
                {SHOP.tagline}. Reserve your slot online, get a reference code instantly, and let
                our pit crew take care of the rest.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button asChild size="lg" className="font-display tracking-wide uppercase">
                  <Link to="/book">
                    <CalendarCheck /> Book an appointment
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="font-display tracking-wide uppercase"
                >
                  <Link to="/my-appointment">Track my booking</Link>
                </Button>
              </div>
              <div className="mt-8 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Certified mechanics
                </span>
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" /> 48-hour advance booking
                </span>
                <span className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-primary" /> Genuine parts
                </span>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 -z-10 rounded-full bg-primary/10 blur-3xl" />
              <img
                src={logo.url}
                alt="Fake Rider Motorparts official logo"
                className="mx-auto w-full max-w-lg drop-shadow-2xl"
              />
            </div>
          </div>
        </section>

        <section className="border-y border-border/70 bg-card/40">
          <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-8 sm:grid-cols-3">
            <InfoTile
              icon={<MapPin className="h-5 w-5 text-primary" />}
              title="Shop location"
              value={SHOP.address}
              href="https://www.google.com/maps/search/?api=1&query=Fake+Rider+Motoparts+and+Accessories,+Purok+Bangkal+Sta.+Cruz,+Baclayon,+Bohol"
            />
            <InfoTile
              icon={<Clock className="h-5 w-5 text-primary" />}
              title="Open hours"
              value={SHOP.hours}
            />
            <InfoTile
              icon={<Phone className="h-5 w-5 text-primary" />}
              title="Call or text"
              value={SHOP.phone}
            />
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-16">
          <SectionHeading
            eyebrow="Shop showcase"
            title="Featured parts & accessories"
            action={
              <Link to="/shop" className="text-sm text-primary hover:underline">
                View full shop
              </Link>
            }
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.data?.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
            {featured.isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-72 animate-pulse rounded-xl border border-border bg-card/60"
                />
              ))}
          </div>
        </section>

        <section className="border-y border-border/70 bg-card/30">
          <div className="mx-auto w-full max-w-7xl px-4 py-16">
            <SectionHeading
              eyebrow="Service menu"
              title="What our pit crew can do"
              action={
                <Link to="/services" className="text-sm text-primary hover:underline">
                  All services
                </Link>
              }
            />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {services.data?.map((s) => (
                <Card key={s.id} className="border-border/70 bg-background/60">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-lg tracking-wide uppercase">{s.name}</h3>
                      <span className="font-display text-lg text-primary">
                        {formatPHP(s.price)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{s.description}</p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Approx. {s.duration_minutes} minutes
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-16 md:grid-cols-2">
          <img
            src={famImage.url}
            alt="The Fake Rider Motorparts riding family at a local motocross event"
            loading="lazy"
            className="w-full rounded-2xl border border-border/70 object-cover shadow-xl"
          />
          <div>
            <SectionHeading
              eyebrow="Our riders family"
              title="More than a shop, a riding community"
            />
            <p className="text-muted-foreground">
              From weekend trail rides to local motocross events, Fake Rider Motorparts grew with
              the riders it serves. Every unit that rolls into our garage gets the same attention we
              give our own race bikes.
            </p>
            <p className="mt-4 text-muted-foreground">
              Drop by, join a ride, or reserve your service slot online and skip the waiting line.
            </p>
            <Button asChild className="mt-6 font-display tracking-wide uppercase">
              <Link to="/book">Reserve your slot</Link>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function InfoTile({
  icon,
  title,
  value,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      {icon}
      <div>
        <p className="flex items-center gap-1 text-xs tracking-widest text-muted-foreground uppercase">
          {title}
          {href && <ExternalLink className="h-3 w-3" />}
        </p>
        <p className="text-sm text-foreground">{value}</p>
      </div>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/50 p-4 text-left transition-colors hover:border-primary/50 hover:bg-background/80"
      >
        {content}
      </a>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/50 p-4">
      {content}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs tracking-[0.3em] text-accent uppercase">{eyebrow}</p>
        <h2 className="font-display text-3xl font-bold uppercase md:text-4xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}
