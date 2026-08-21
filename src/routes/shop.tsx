import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ProductCard } from "@/components/site/product-card";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop Parts & Accessories | Fake Rider" },
      {
        name: "description",
        content:
          "Browse genuine motorcycle parts and riding accessories available at Fake Rider Motorparts.",
      },
      { property: "og:title", content: "Fake Rider Motorparts Shop" },
      {
        property: "og:description",
        content: "Parts and accessories available in store.",
      },
    ],
  }),
  component: ShopPage,
});

const tabs = [
  { value: "all", label: "All" },
  { value: "part", label: "Parts" },
  { value: "accessory", label: "Accessories" },
];

function ShopPage() {
  const [tab, setTab] = useState("all");
  const [term, setTerm] = useState("");

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .neq("category", "motorcycle")
        .order("sort_order");
      if (error) throw error;
      return Array.from(new Map((data ?? []).map((p) => [p.name.trim(), p])).values());
    },
  });

  const list = (products.data ?? []).filter(
    (p) =>
      (tab === "all" || p.category === tab) &&
      (term.trim() === "" ||
        `${p.name} ${p.brand ?? ""} ${p.description ?? ""}`
          .toLowerCase()
          .includes(term.toLowerCase())),
  );

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl px-4 py-12">
        <p className="text-xs tracking-[0.3em] text-accent uppercase">Shop showcase</p>
        <h1 className="font-display text-4xl font-bold uppercase md:text-5xl">
          Parts & Accessories
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Everything we stock in the garage. Prices are in Philippine peso and may change without
          prior notice &mdash; message us to reserve an item.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="font-display uppercase">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search item or brand"
            className="max-w-xs"
          />
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
        {!products.isLoading && list.length === 0 && (
          <p className="py-16 text-center text-muted-foreground">No items match your search.</p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
