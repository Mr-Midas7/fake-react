import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Archive } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatPHP } from "@/lib/shop";

export const Route = createFileRoute("/_authenticated/admin/services")({
  component: ServicesAdmin,
});

type Service = {
  id: string;
  name: string;
  description: string | null;
  price: number | string;
  duration_minutes: number;
  is_active: boolean;
  category: string;
};

const blank = { name: "", description: "", duration_minutes: "60", is_active: true };

function ServicesAdmin() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState({ ...blank });
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "hidden">("all");

  const services = useQuery({
    queryKey: ["admin-services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").order("sort_order");
      if (error) throw error;
      return Array.from(new Map((data ?? []).map((s) => [s.name.trim(), s])).values()) as Service[];
    },
  });

  const distinctCategories = useMemo(() => {
    if (!services.data) return [];
    return Array.from(new Set(services.data.map((s) => s.category).filter(Boolean))).sort();
  }, [services.data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        duration_minutes: Number(form.duration_minutes) || 60,
        is_active: form.is_active,
      };
      const res = editing
        ? await supabase.from("services").update(payload).eq("id", editing.id)
        : await supabase.from("services").insert(payload);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      toast.success("Service saved");
      setOpen(false);
      setEditing(null);
      setForm({ ...blank });
      qc.invalidateQueries({ queryKey: ["admin-services"] });
    },
    onError: () => toast.error("Could not save the service."),
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service archived");
      qc.invalidateQueries({ queryKey: ["admin-services"], exact: false });
      qc.invalidateQueries({ queryKey: ["archived-services"], exact: false });
    },
    onError: (err: Error) => toast.error(`Archive failed: ${err.message}`),
  });

  return (
    <div>
      <PageHeader
        title="Services"
        description="Service menu offered on the booking form."
        action={
          <Button
            className="font-display uppercase"
            onClick={() => {
              setEditing(null);
              setForm({ ...blank });
              setOpen(true);
            }}
          >
            <Plus /> Add service
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label className="text-sm">Category</Label>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All categories</SelectItem>
              {distinctCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Status</Label>
          <Select
            value={filterStatus}
            onValueChange={(v) => setFilterStatus(v as "all" | "active" | "hidden")}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(filterCategory || filterStatus !== "all") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFilterCategory("");
              setFilterStatus("all");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <Card className="border-border/70 bg-card/60">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.data
                ?.filter(
                  (s) =>
                    (!filterCategory || s.category === filterCategory) &&
                    (filterStatus === "all" ||
                      (filterStatus === "active" && s.is_active) ||
                      (filterStatus === "hidden" && !s.is_active)),
                )
                .map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <span className="block text-sm">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{s.description}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground capitalize">
                      {s.category}
                    </TableCell>
                    <TableCell className="text-sm">{s.duration_minutes} mins</TableCell>
                    <TableCell className="text-sm text-primary">{formatPHP(s.price)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase">
                        {s.is_active ? "Active" : "Hidden"}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(s);
                          setForm({
                            name: s.name,
                            description: s.description ?? "",
                            duration_minutes: String(s.duration_minutes),
                            is_active: s.is_active,
                          });
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => archive.mutate(s.id)}>
                        <Archive className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display uppercase">
              {editing ? "Edit service" : "New service"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Duration (minutes)</Label>
              <Input
                value={form.duration_minutes}
                inputMode="numeric"
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              Show on the public booking form
            </label>
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()}>
              Save service
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
