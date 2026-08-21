import { Link } from "@tanstack/react-router";
import { Clock, Facebook, Mail, MapPin, Phone } from "lucide-react";

import logo from "@/assets/logo-shp.png.asset.json";
import { SHOP } from "@/lib/shop";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border/70 bg-card/40">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 md:grid-cols-3">
        <div>
          <img
            src={logo.url}
            alt="Fake Rider Motorparts logo"
            className="h-20 w-20 object-contain"
          />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Your local pit stop for premium motorparts, accessories and race-grade service. Ride
            hard, maintain harder.
          </p>
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">
          <h3 className="font-display text-base tracking-wide text-foreground uppercase">
            Visit the Shop
          </h3>
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 text-primary" /> {SHOP.address}
          </p>
          <p className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> {SHOP.hours}
          </p>
          <p className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" /> {SHOP.phone}
          </p>
          <p className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" /> {SHOP.email}
          </p>
          <p className="flex items-center gap-2">
            <Facebook className="h-4 w-4 text-primary" />
            <a
              href={SHOP.facebook}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              Fake Rider Motorparts
            </a>
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <h3 className="font-display text-base tracking-wide text-foreground uppercase">
            Quick Links
          </h3>
          <div className="flex flex-col gap-2 text-muted-foreground">
            <Link to="/book" className="hover:text-foreground">
              Book an appointment
            </Link>
            <Link to="/my-appointment" className="hover:text-foreground">
              View or cancel a booking
            </Link>
            <Link to="/services" className="hover:text-foreground">
              Services & prices
            </Link>
            <Link to="/shop" className="hover:text-foreground">
              Parts, accessories & units
            </Link>
            <Link to="/auth" className="hover:text-foreground">
              Staff login
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-border/70 py-4 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} {SHOP.name}. All rights reserved.
      </div>
    </footer>
  );
}
