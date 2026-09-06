import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Archive } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
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
import { activeStatusTone, formatPHP } from "@/lib/shop";

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
  is_archived: boolean;
  category: string;
};

const blank = {
  name: "",
  category: "general",
  description: "",
  price: "",
  duration_minutes: "60",
  is_active: true,
};

function ServicesAdmin() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState({ ...blank });
  const [formErrors, setFormErrors] = useState<
    Partial<Record<"name" | "category" | "duration" | "price", string | undefined>>
  >({});
  const [filterCategory, setFilterCategory] = useState<string>("");
  const hasValidNewPrice =
    editing !== null ||
    (form.price.trim() !== "" && Number.isFinite(Number(form.price)) && Number(form.price) >= 0);

  const services = useQuery({
    queryKey: ["admin-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("is_archived", false)
        .order("sort_order");
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
        category: form.category.trim().toLowerCase(),
        description: form.description.trim() || null,
        duration_minutes: Number(form.duration_minutes) || 60,
        is_active: form.is_active,
      };

      if (!editing && !hasValidNewPrice) {
        throw new Error("Enter a valid price.");
      }

      const res = editing
        ? await supabase.from("services").update(payload).eq("id", editing.id)
        : await supabase.from("services").insert({ ...payload, price: Number(form.price) });
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      toast.success("Service saved");
      setOpen(false);
      setEditing(null);
      setForm({ ...blank });
      qc.invalidateQueries({ queryKey: ["admin-services"] });
    },
    onError: () => setFormErrors({ name: "Could not save the service." }),
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").update({ is_archived: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      qc.setQueryData<Service[]>(["admin-services"], (items) =>
        items?.filter((service) => service.id !== id),
      );
      toast.success("Service archived");
      qc.invalidateQueries({ queryKey: ["admin-services"], exact: false });
      qc.invalidateQueries({ queryKey: ["archived-services"], exact: false });
    },
    onError: (err: Error) => toast.error(`Archive failed: ${err.message}`),
  });

  function validateForm() {
    const nextErrors: Partial<Record<"name" | "category" | "duration" | "price", string>> = {};
    if (form.name.trim().length < 2) {
      nextErrors.name = "Enter a service name with at least 2 characters.";
    }
    if (form.category.trim().length < 2) {
      nextErrors.category = "Enter a service category with at least 2 characters.";
    }
    const duration = Number(form.duration_minutes);
    if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
      nextErrors.duration = "Enter a service duration from 15 to 480 minutes.";
    }
    if (!editing && !hasValidNewPrice) {
      nextErrors.price = "Enter a valid price of PHP 0 or more.";
    }
    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

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
              setFormErrors({});
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

        {filterCategory && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFilterCategory("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <Card className="border-border/70 bg-card/60">
        <CardContent className="overflow-x-auto p-0">
          <Table className="admin-data-table">
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
                ?.filter((s) => !filterCategory || s.category === filterCategory)
                .map((s) => (
                  <TableRow key={s.id}>
                    <TableCell data-label="Service">
                      <span className="block text-sm">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{s.description}</span>
                    </TableCell>
                    <TableCell
                      data-label="Category"
                      className="text-xs text-muted-foreground capitalize"
                    >
                      {s.category}
                    </TableCell>
                    <TableCell data-label="Duration" className="text-sm">
                      {s.duration_minutes} mins
                    </TableCell>
                    <TableCell data-label="Price" className="text-sm text-primary">
                      {formatPHP(s.price)}
                    </TableCell>
                    <TableCell data-label="Status">
                      <Badge
                        variant="outline"
                        className={`uppercase ${activeStatusTone(s.is_active)}`}
                      >
                        {s.is_active ? "Active" : "Deactivated"}
                      </Badge>
                    </TableCell>
                    <TableCell data-label="Actions" className="space-x-1 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(s);
                          setForm({
                            name: s.name,
                            category: s.category,
                            description: s.description ?? "",
                            price: String(s.price),
                            duration_minutes: String(s.duration_minutes),
                            is_active: s.is_active,
                          });
                          setFormErrors({});
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
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                  setFormErrors((current) => ({ ...current, name: undefined }));
                }}
                aria-invalid={!!formErrors.name}
              />
              <FieldError message={formErrors.name} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="service-category">Category</Label>
              <Input
                id="service-category"
                list="service-category-options"
                value={form.category}
                onChange={(e) => {
                  setForm({ ...form, category: e.target.value });
                  setFormErrors((current) => ({ ...current, category: undefined }));
                }}
                placeholder="e.g. maintenance"
                aria-invalid={!!formErrors.category}
              />
              <FieldError message={formErrors.category} />
              <datalist id="service-category-options">
                {distinctCategories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Select an existing category or enter a new one.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Duration (minutes)</Label>
              <Input
                value={form.duration_minutes}
                inputMode="numeric"
                onChange={(e) => {
                  setForm({ ...form, duration_minutes: e.target.value.replace(/\D/g, "") });
                  setFormErrors((current) => ({ ...current, duration: undefined }));
                }}
                min="15"
                max="480"
                aria-invalid={!!formErrors.duration}
              />
              <FieldError message={formErrors.duration} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            {editing ? (
              <p className="text-xs text-muted-foreground">
                Current price: {formatPHP(editing.price)}. To change it, use{" "}
                <a href="/admin/prices" className="underline">
                  Price Management
                </a>
                .
              </p>
            ) : (
              <div className="space-y-1.5">
                <Label>Price (PHP)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => {
                    setForm({ ...form, price: e.target.value });
                    setFormErrors((current) => ({ ...current, price: undefined }));
                  }}
                  placeholder="0.00"
                  aria-invalid={!!formErrors.price}
                />
                <FieldError message={formErrors.price} />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
              Show on the public booking form
            </label>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (validateForm()) save.mutate();
              }}
              disabled={save.isPending}
            >
              Save service
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
