import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";

import logo from "@/assets/logo-shp.png.asset.json";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "Home" },
  { to: "/services", label: "Services" },
  { to: "/shop", label: "Shop" },
  { to: "/my-appointment", label: "My Appointment" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center gap-4 px-4">
        <Link to="/" className="flex items-center">
          <img
            src={logo.url}
            alt="Fake Rider Motorparts logo"
            className="-ml-8 h-16 w-auto object-contain -mr-8"
          />
          <span className="font-display text-lg leading-none font-bold tracking-wide uppercase">
            Fake Rider
            <span className="block text-[0.65rem] tracking-[0.28em] text-muted-foreground">
              Motorparts
            </span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "text-primary" }}
              activeOptions={{ exact: l.to === "/" }}
            >
              {l.label}
            </Link>
          ))}
          <Button asChild className="ml-2 font-display tracking-wide uppercase">
            <Link to="/book">Book Now</Link>
          </Button>
        </nav>

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto md:hidden"
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
        >
          <Menu />
        </Button>
      </div>

      <div className={cn("border-t border-border/70 md:hidden", open ? "block" : "hidden")}>
        <nav className="mx-auto flex max-w-7xl flex-col p-3">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "text-primary" }}
              activeOptions={{ exact: l.to === "/" }}
            >
              {l.label}
            </Link>
          ))}
          <Button asChild className="mt-2 font-display tracking-wide uppercase">
            <Link to="/book" onClick={() => setOpen(false)}>
              Book Now
            </Link>
          </Button>
        </nav>
      </div>
      <div className="checker-strip h-[6px] w-full opacity-20" />
    </header>
  );
}
