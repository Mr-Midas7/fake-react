import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Archive } from "lucide-react";
import { forwardRef, useMemo, useImperativeHandle, useState } from "react";
import { toast } from "sonner";

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
import { cn } from "@/lib/utils";

type Product = {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  description: string | null;
  price: number | string;
  image_url: string | null;
  in_stock: boolean;
  is_featured: boolean;
  is_active: boolean;
  is_archived: boolean;
  sort_order: number;
};

const blank = {
  name: "",
  brand: "",
  description: "",
  price: "",
  image_url: "",
  in_stock: true,
  is_featured: false,
  is_active: true,
};

export interface ProductManagerHandle {
  openNew: () => void;
}

export const ProductManager = forwardRef<
  ProductManagerHandle,
  { category: "part" | "accessory" | "motorcycle" }
>(function ProductManager({ category }, ref) {
  const qc = useQueryClient();
  const isMotorcycle = category === "motorcycle";
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...blank });
  const [formError, setFormError] = useState("");
  const [imageSource, setImageSource] = useState<"url" | "local">("url");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filterBrand, setFilterBrand] = useState<string>("");
  const [filterModel, setFilterModel] = useState<string>("");
  const [filterStock, setFilterStock] = useState<"all" | "in_stock" | "out">("all");
  const hasValidNewPrice =
    isMotorcycle ||
    editing !== null ||
    (form.price.trim() !== "" && Number.isFinite(Number(form.price)) && Number(form.price) >= 0);

  useImperativeHandle(ref, () => ({
    openNew,
  }));

  const items = useQuery({
    queryKey: ["admin-products", category],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .in("category", category === "part" ? ["part", "accessory"] : [category])
        .eq("is_archived", false)
        .order("sort_order");
      if (error) throw error;
      return Array.from(new Map((data ?? []).map((p) => [p.name.trim(), p])).values()) as Product[];
    },
  });

  const motorcycleCatalog = useQuery({
    queryKey: ["admin-motorcycle-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,brand,name")
        .eq("category", "motorcycle")
        .eq("is_active", true)
        .eq("is_archived", false)
        .order("brand")
        .order("name");
      if (error) throw error;
      return Array.from(new Map((data ?? []).map((m) => [m.name.trim(), m])).values());
    },
    enabled: isMotorcycle,
  });

  const distinctBrands = useMemo(() => {
    if (!isMotorcycle || !motorcycleCatalog.data) return [];
    return Array.from(
      new Set(motorcycleCatalog.data.map((p) => p.brand).filter((b): b is string => !!b)),
    ).sort();
  }, [isMotorcycle, motorcycleCatalog.data]);

  const distinctModelsForBrand = useMemo(() => {
    if (!isMotorcycle || !motorcycleCatalog.data) return [];
    if (!filterBrand) return [];
    return Array.from(
      new Set(
        motorcycleCatalog.data
          .filter((p) => p.brand === filterBrand)
          .map((p) => p.name)
          .filter(Boolean),
      ),
    ).sort();
  }, [isMotorcycle, motorcycleCatalog.data, filterBrand]);

  const distinctBrandsForItems = useMemo(() => {
    if (!items.data) return [];
    return Array.from(
      new Set(items.data.map((p) => p.brand).filter((b): b is string => !!b)),
    ).sort();
  }, [items.data]);

  const brandOptions = isMotorcycle ? distinctBrands : distinctBrandsForItems;

  const filteredItems = useMemo(() => {
    if (!items.data) return [];
    let result = items.data;
    if (isMotorcycle) {
      if (filterBrand) result = result.filter((p) => p.brand === filterBrand);
      if (filterModel) result = result.filter((p) => p.name === filterModel);
    } else {
      if (filterBrand) result = result.filter((p) => p.brand === filterBrand);
      if (filterStock !== "all") {
        result = result.filter((p) => (filterStock === "in_stock" ? p.in_stock : !p.in_stock));
      }
    }
    return result;
  }, [items.data, isMotorcycle, filterBrand, filterModel, filterStock]);

  async function uploadImage(file: File): Promise<string> {
    const fileExt = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from("products").upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage.from("products").getPublicUrl(fileName);
    return urlData.publicUrl;
  }

  const save = useMutation({
    mutationFn: async () => {
      let resolvedImageUrl: string | null = form.image_url.trim() || null;
      if (imageSource === "local" && uploadedFile) {
        setUploading(true);
        try {
          resolvedImageUrl = await uploadImage(uploadedFile);
        } finally {
          setUploading(false);
        }
      }

      if (isMotorcycle) {
        const payload = {
          name: form.name.trim(),
          brand: form.brand.trim() || null,
          description: form.description.trim() || null,
          image_url: resolvedImageUrl,
          is_active: form.is_active,
          category: editing ? editing.category : category,
        };
        const res = editing
          ? await supabase.from("products").update(payload).eq("id", editing.id)
          : await supabase.from("products").insert(payload);
        if (res.error) throw res.error;
      } else {
        const payload = {
          name: form.name.trim(),
          brand: form.brand.trim() || null,
          description: form.description.trim() || null,
          image_url: resolvedImageUrl,
          in_stock: form.in_stock,
          is_featured: form.is_featured,
          is_active: form.is_active,
          category: editing ? editing.category : category,
        };

        if (!hasValidNewPrice) {
          throw new Error("Enter a valid price.");
        }

        const res = editing
          ? await supabase.from("products").update(payload).eq("id", editing.id)
          : await supabase.from("products").insert({ ...payload, price: Number(form.price) });
        if (res.error) throw res.error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Item updated" : "Item added");
      setOpen(false);
      setEditing(null);
      setForm({ ...blank });
      setImageSource("url");
      setUploadedFile(null);
      setUploadPreview(null);
      qc.invalidateQueries({ queryKey: ["admin-products", category] });
    },
    onError: (err: Error) => {
      console.error("Save failed:", err);
      toast.error(`Save failed: ${err.message}`);
    },
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").update({ is_archived: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      qc.setQueryData<Product[]>(["admin-products", category], (items) =>
        items?.filter((item) => item.id !== id),
      );
      toast.success("Product archived");
      qc.invalidateQueries({ queryKey: ["admin-products", category], exact: false });
      qc.invalidateQueries({ queryKey: ["archived-products"], exact: false });
    },
    onError: (err: Error) => {
      console.error("Archive failed:", err);
      toast.error(`Archive failed: ${err.message}`);
    },
  });

  function openNew() {
    setEditing(null);
    setForm({ ...blank });
    setImageSource("url");
    setUploadedFile(null);
    setUploadPreview(null);
    setFormError("");
    setOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      brand: p.brand ?? "",
      description: p.description ?? "",
      price: String(p.price),
      image_url: p.image_url ?? "",
      in_stock: p.in_stock,
      is_featured: p.is_featured,
      is_active: p.is_active,
    });
    setImageSource(p.image_url ? "url" : "url");
    setUploadedFile(null);
    setUploadPreview(null);
    setFormError("");
    setOpen(true);
  }

  function validateForm() {
    if (form.name.trim().length < 2) {
      setFormError("Enter an item name with at least 2 characters.");
      return false;
    }
    if (isMotorcycle && !form.brand.trim()) {
      setFormError("Enter the motorcycle brand.");
      return false;
    }
    if (!isMotorcycle && !editing && !hasValidNewPrice) {
      setFormError("Enter a valid price of PHP 0 or more.");
      return false;
    }
    if (imageSource === "url" && form.image_url.trim()) {
      try {
        new URL(form.image_url.trim());
      } catch {
        setFormError("Enter a valid image URL, including https://, or choose Local Storage.");
        return false;
      }
    }
    if (imageSource === "local" && uploadedFile && !uploadedFile.type.startsWith("image/")) {
      setFormError("Choose a valid image file.");
      return false;
    }
    setFormError("");
    return true;
  }

  return (
    <>
      {isMotorcycle && (
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Brand</Label>
            <Select
              value={filterBrand}
              onValueChange={(v) => {
                setFilterBrand(v);
                setFilterModel("");
              }}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All brands</SelectItem>
                {distinctBrands.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Model</Label>
            <Select value={filterModel} onValueChange={setFilterModel} disabled={!filterBrand}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder={filterBrand ? "All models" : "Select a brand first"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All models</SelectItem>
                {distinctModelsForBrand.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m.replace(new RegExp(`^${filterBrand} `), "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(filterBrand || filterModel) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setFilterBrand("");
                setFilterModel("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {!isMotorcycle && (
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Brand</Label>
            <Select value={filterBrand} onValueChange={setFilterBrand}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All brands</SelectItem>
                {distinctBrandsForItems.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Stock</Label>
            <Select
              value={filterStock}
              onValueChange={(v) => setFilterStock(v as "all" | "in_stock" | "out")}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stock</SelectItem>
                <SelectItem value="in_stock">In stock</SelectItem>
                <SelectItem value="out">Out of stock</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(filterBrand || filterStock !== "all") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setFilterBrand("");
                setFilterStock("all");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display uppercase">
              {editing ? "Edit item" : "New item"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Model name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`product-brand-${category}`}>Brand</Label>
              <Input
                id={`product-brand-${category}`}
                list={`product-brand-options-${category}`}
                value={form.brand}
                onChange={(e) => {
                  setForm({ ...form, brand: e.target.value });
                  setFormError("");
                }}
                placeholder="Select or enter a brand"
              />
              <datalist id={`product-brand-options-${category}`}>
                {brandOptions.map((brand) => (
                  <option key={brand} value={brand} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground">
                Select an existing brand or enter a new one.
              </p>
            </div>
            {!isMotorcycle && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Image source</Label>
                  <Select
                    value={imageSource}
                    onValueChange={(v: "url" | "local") => {
                      setImageSource(v);
                      if (v === "url") {
                        setUploadedFile(null);
                        setUploadPreview(null);
                      } else {
                        setForm({ ...form, image_url: "" });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="url">URL</SelectItem>
                      <SelectItem value="local">Local Storage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {imageSource === "url" && (
                  <div className="space-y-1.5">
                    <Label>Image URL</Label>
                    <Input
                      value={form.image_url}
                      onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                      placeholder="https://"
                    />
                  </div>
                )}
                {imageSource === "local" && (
                  <div className="space-y-1.5">
                    <Label>Upload image</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setUploadedFile(file);
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => setUploadPreview(reader.result as string);
                          reader.readAsDataURL(file);
                        } else {
                          setUploadPreview(null);
                        }
                      }}
                    />
                    {uploadPreview && (
                      <img
                        src={uploadPreview}
                        alt="Upload preview"
                        className="h-24 w-24 rounded-md object-cover"
                      />
                    )}
                  </div>
                )}
              </div>
            )}
            {!isMotorcycle && !editing && (
              <div className="space-y-1.5">
                <Label>Price (PHP)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            )}
            {!isMotorcycle && editing && (
              <p className="text-xs text-muted-foreground">
                Current price: {formatPHP(editing.price)}. To change it, use{" "}
                <a href="/admin/prices" className="underline">
                  Price Management
                </a>{" "}
                only.
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-6 pt-1">
              {!isMotorcycle && (
                <>
                  <Toggle
                    label="In stock"
                    checked={form.in_stock}
                    onChange={(v) => setForm({ ...form, in_stock: v })}
                  />
                  <Toggle
                    label="Featured"
                    checked={form.is_featured}
                    onChange={(v) => setForm({ ...form, is_featured: v })}
                  />
                </>
              )}
              <Toggle
                label="Visible in booking"
                checked={form.is_active}
                onChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>
          {formError && <p className="text-xs text-destructive">{formError}</p>}
          <DialogFooter>
            <Button
              onClick={() => {
                if (validateForm()) save.mutate();
              }}
              disabled={save.isPending || uploading}
            >
              {uploading ? "Uploading..." : editing ? "Update" : "Save item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-border/70 bg-card/60">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Brand</TableHead>
                {isMotorcycle && <TableHead>Status</TableHead>}
                {!isMotorcycle && <TableHead>Price</TableHead>}
                {!isMotorcycle && <TableHead>Status</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <span className="block text-sm">{p.name}</span>
                    {!isMotorcycle && (
                      <span className="text-xs text-muted-foreground capitalize">{p.category}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{p.brand ?? "-"}</TableCell>
                  {isMotorcycle && (
                    <TableCell>
                      <Badge variant="outline" className="uppercase">
                        {p.is_active ? "Active" : "Deactivated"}
                      </Badge>
                    </TableCell>
                  )}
                  {!isMotorcycle && (
                    <TableCell className="text-sm text-primary">{formatPHP(p.price)}</TableCell>
                  )}
                  {!isMotorcycle && (
                    <TableCell className="space-x-1">
                      <Badge variant="outline" className="uppercase">
                        {p.in_stock ? "In stock" : "Out"}
                      </Badge>
                      {p.is_featured && (
                        <Badge className="bg-primary text-primary-foreground uppercase">
                          Featured
                        </Badge>
                      )}
                      {!p.is_active && <Badge variant="outline">Deactivated</Badge>}
                    </TableCell>
                  )}
                  <TableCell className="space-x-1 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => archive.mutate(p.id)}>
                      <Archive className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredItems.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">Nothing here yet.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
});

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}
