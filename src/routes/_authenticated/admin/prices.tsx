import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { formatPHP } from "@/lib/shop";

export const Route = createFileRoute("/_authenticated/admin/prices")({
  component: PricesPage,
});

function PricesPage() {
  const [historyItem, setHistoryItem] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Prices Management"
        description="Update the price list for services and shop items. A change reason is recorded for every edit."
      />
      <Tabs defaultValue="services">
        <div className="overflow-x-auto overflow-y-visible">
          <TabsList className="mb-4 w-max min-w-full">
            <TabsTrigger value="services" className="font-display uppercase">
              Services
            </TabsTrigger>
            <TabsTrigger value="products" className="font-display uppercase">
              Parts & units
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="services">
          <PriceTable table="services" onHistoryClick={setHistoryItem} />
        </TabsContent>
        <TabsContent value="products">
          <PriceTable table="products" onHistoryClick={setHistoryItem} />
        </TabsContent>
      </Tabs>

      <PriceHistoryDialog
        item={historyItem}
        open={!!historyItem}
        onOpenChange={(open) => !open && setHistoryItem(null)}
      />
    </div>
  );
}

function PriceTable({
  table,
  onHistoryClick,
}: {
  table: "services" | "products";
  onHistoryClick: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"active" | "archived">("active");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const rows = useQuery({
    queryKey: ["prices", table, filter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select("id,name,price,is_active")
        .eq("is_active", filter === "active")
        .order("name");
      if (error) throw error;
      return Array.from(
        new Map(
          (data ?? []).map(
            (r: { id: string; name: string; price: number | string; is_active: boolean }) => [
              r.name.trim(),
              r,
            ],
          ),
        ).values(),
      );
    },
  });

  const save = useMutation({
    mutationFn: async ({
      id,
      price,
      name,
      reason,
    }: {
      id: string;
      price: number;
      name: string;
      reason: string;
    }) => {
      const oldPrice = Number(rows.data?.find((r) => r.id === id)?.price ?? 0);
      const newPrice = price;

      const { error: histError } = await supabase.from("price_history").insert({
        table_name: table,
        item_id: id,
        item_name: name,
        old_price: oldPrice,
        new_price: newPrice,
        reason: reason.trim() || null,
      });
      if (histError) throw histError;

      const { error } = await supabase.from(table).update({ price }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Price updated");
      qc.invalidateQueries({ queryKey: ["prices"] });
      setDrafts({});
      setReasons({});
    },
    onError: (err: Error) => {
      console.error("Price update failed:", err);
      toast.error(`Price update failed: ${err.message}`);
    },
  });

  const handleSave = (r: { id: string; name: string; price: number | string }) => {
    const newPrice = Number(drafts[r.id] ?? String(r.price));
    const reason = reasons[r.id] ?? "";
    setPending({ ...pending, [r.id]: true });
    save.mutate(
      { id: r.id, price: newPrice, name: r.name, reason },
      {
        onSettled: () => setPending({ ...pending, [r.id]: false }),
      },
    );
  };

  const hasChanges = (r: { id: string; price: number | string }) => {
    return (drafts[r.id] ?? String(r.price)) !== String(r.price);
  };

  return (
    <Card className="mt-4 border-border/70 bg-card/60">
      <CardContent className="overflow-x-auto p-0">
        <div className="p-4">
          <div className="mb-4 flex gap-2">
            <Button
              size="sm"
              variant={filter === "active" ? "default" : "outline"}
              onClick={() => setFilter("active")}
              className="font-display uppercase"
            >
              Active
            </Button>
            <Button
              size="sm"
              variant={filter === "archived" ? "default" : "outline"}
              onClick={() => setFilter("archived")}
              className="font-display uppercase"
            >
              Archived
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Current price</TableHead>
              {filter === "active" && <TableHead>New price</TableHead>}
              {filter === "active" && <TableHead>Reason</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.data?.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <span className="text-sm">{r.name}</span>
                </TableCell>
                <TableCell className="text-sm text-primary">{formatPHP(r.price)}</TableCell>
                {filter === "active" && (
                  <>
                    <TableCell>
                      <Input
                        className="max-w-32"
                        inputMode="decimal"
                        value={drafts[r.id] ?? String(r.price)}
                        onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="max-w-40"
                        placeholder="e.g. supplier cost increase"
                        value={reasons[r.id] ?? ""}
                        onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })}
                      />
                    </TableCell>
                  </>
                )}
                <TableCell>
                  <Badge variant="outline" className="uppercase">
                    {r.is_active ? "Active" : "Archived"}
                  </Badge>
                </TableCell>
                <TableCell className="flex justify-end gap-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => onHistoryClick(r.id)}>
                    History
                  </Button>
                  {filter === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!hasChanges(r) || pending[r.id]}
                      onClick={() => handleSave(r)}
                    >
                      Save
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.data?.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {filter === "active" ? "No active items found." : "No archived items found."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PriceHistoryDialog({
  item,
  open,
  onOpenChange,
}: {
  item: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const history = useQuery({
    queryKey: ["price-history", item],
    queryFn: async () => {
      if (!item) return [];
      const { data, error } = await supabase
        .from("price_history")
        .select("*")
        .eq("item_id", item)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!item,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display uppercase">Price change history</DialogTitle>
          <DialogDescription>
            {history.data?.length === 0
              ? "No price changes recorded."
              : "Recent price changes for this item."}
          </DialogDescription>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Old price</TableHead>
              <TableHead>New price</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.data?.map((h) => (
              <TableRow key={h.id}>
                <TableCell className="text-xs">
                  {new Date(h.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatPHP(h.old_price)}
                </TableCell>
                <TableCell className="text-sm text-primary">{formatPHP(h.new_price)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{h.reason ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
