import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Archive } from "lucide-react";
import { forwardRef, useMemo, useImperativeHandle, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { ArchiveConfirmationDialog } from "@/components/admin/archive-confirmation-dialog";
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
  stock_quantity: number;
  engine_cc: number | null;
  fuel_type: "FI" | "Carbureted" | "Electric" | null;
  transmission: "Manual" | "Semi-Automatic" | "Automatic" | null;
  is_featured: boolean;
  is_active: boolean;
  is_archived: boolean;
  sort_order: number;
  created_at: string;
};

const blank = {
  name: "",
  brand: "",
  description: "",
  price: "",
  image_url: "",
  stock_quantity: "0",
  engine_cc: "",
  fuel_type: "FI" as "FI" | "Carbureted" | "Electric",
  transmission: "Manual" as "Manual" | "Semi-Automatic" | "Automatic",
  is_featured: false,
  is_active: true,
};
const ALL_BRANDS = "__all_brands__";
const ALL_MODELS = "__all_models__";
const NO_BRAND = "__no_brand__";
const NEW_BRAND = "__new_brand__";

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
  const [isCustomBrand, setIsCustomBrand] = useState(false);
  const [formErrors, setFormErrors] = useState<
    Partial<
      Record<
        | "name"
        | "brand"
        | "engineCc"
        | "fuelType"
        | "transmission"
        | "price"
        | "stockQuantity"
        | "imageUrl"
        | "imageFile",
        string | undefined
      >
    >
  >({});
  const [imageSource, setImageSource] = useState<"url" | "local">("url");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filterBrand, setFilterBrand] = useState<string>(ALL_BRANDS);
  const [filterModel, setFilterModel] = useState<string>(ALL_MODELS);
  const [filterStock, setFilterStock] = useState<"all" | "in_stock" | "out">("all");
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null);
  const hasValidNewPrice =
    isMotorcycle ||
    editing !== null ||
    (form.price.trim() !== "" && Number.isFinite(Number(form.price)) && Number(form.price) >= 0);
  const hasValidStockQuantity =
    isMotorcycle ||
    (form.stock_quantity.trim() !== "" &&
      Number.isInteger(Number(form.stock_quantity)) &&
      Number(form.stock_quantity) >= 0);

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
      const deduplicated = Array.from(
        new Map((data ?? []).map((p) => [`${p.brand ?? ""}:${p.name.trim()}`, p])).values(),
      ) as Product[];
      return isMotorcycle
        ? deduplicated.sort(
            (a, b) =>
              (a.brand ?? "").localeCompare(b.brand ?? "") ||
              modelName(a).localeCompare(modelName(b), undefined, { sensitivity: "base" }),
          )
        : deduplicated;
    },
  });

  const motorcycleCatalog = useQuery({
    queryKey: ["admin-motorcycle-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,brand,name")
        .eq("category", "motorcycle")
        .eq("is_archived", false)
        .order("brand")
        .order("name");
      if (error) throw error;
      return Array.from(
        new Map((data ?? []).map((m) => [`${m.brand ?? ""}:${m.name.trim()}`, m])).values(),
      );
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
    if (filterBrand === ALL_BRANDS) return [];
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
      if (filterBrand !== ALL_BRANDS) result = result.filter((p) => p.brand === filterBrand);
      if (filterModel !== ALL_MODELS) result = result.filter((p) => p.name === filterModel);
    } else {
      if (filterBrand !== ALL_BRANDS) result = result.filter((p) => p.brand === filterBrand);
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
    mutationFn: async (): Promise<Product> => {
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
          engine_cc: form.fuel_type === "Electric" ? null : Number(form.engine_cc),
          fuel_type: form.fuel_type,
          transmission: form.transmission,
          description: form.description.trim() || null,
          image_url: resolvedImageUrl,
          is_active: form.is_active,
          category: editing ? editing.category : category,
        };
        const res = editing
          ? await supabase.from("products").update(payload).eq("id", editing.id).select().single()
          : await supabase.from("products").insert(payload).select().single();
        if (res.error) throw res.error;
        return res.data as Product;
      } else {
        const stockQuantity = Number(form.stock_quantity);
        const payload = {
          name: form.name.trim(),
          brand: form.brand.trim() || null,
          description: form.description.trim() || null,
          image_url: resolvedImageUrl,
          stock_quantity: stockQuantity,
          in_stock: stockQuantity > 0,
          is_featured: form.is_featured,
          is_active: form.is_active,
          category: editing ? editing.category : category,
        };

        if (!hasValidNewPrice) {
          throw new Error("Enter a valid price.");
        }
        if (!hasValidStockQuantity) {
          throw new Error("Enter a whole stock quantity of 0 or more.");
        }

        const res = editing
          ? await supabase.from("products").update(payload).eq("id", editing.id).select().single()
          : await supabase
              .from("products")
              .insert({ ...payload, price: Number(form.price) })
              .select()
              .single();
        if (res.error) throw res.error;
        return res.data as Product;
      }
    },
    onSuccess: (savedProduct) => {
      toast.success(editing ? "Item updated" : "Item added");
      setOpen(false);
      setEditing(null);
      setForm({ ...blank });
      setIsCustomBrand(false);
      setImageSource("url");
      setUploadedFile(null);
      setUploadPreview(null);
      qc.setQueryData<Product[]>(["admin-products", category], (current) => {
        const next = [
          ...(current ?? []).filter((item) => item.id !== savedProduct.id),
          savedProduct,
        ];
        return isMotorcycle
          ? next.sort(
              (a, b) =>
                (a.brand ?? "").localeCompare(b.brand ?? "") ||
                modelName(a).localeCompare(modelName(b), undefined, { sensitivity: "base" }),
            )
          : next;
      });
      qc.invalidateQueries({ queryKey: ["admin-products", category] });
      qc.invalidateQueries({ queryKey: ["admin-motorcycle-catalog"] });
      qc.invalidateQueries({ queryKey: ["motorcycle-catalog"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["featured-products"] });
    },
    onError: (err: Error) => {
      console.error("Save failed:", err);
      setFormErrors({ name: `Save failed: ${err.message}` });
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
    setIsCustomBrand(isMotorcycle);
    setImageSource("url");
    setUploadedFile(null);
    setUploadPreview(null);
    setFormErrors({});
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
      stock_quantity: String(p.stock_quantity),
      engine_cc: p.engine_cc === null ? "" : String(p.engine_cc),
      fuel_type: p.fuel_type ?? "FI",
      transmission: p.transmission ?? "Manual",
      is_featured: p.is_featured,
      is_active: p.is_active,
    });
    setIsCustomBrand(!brandOptions.includes(p.brand ?? ""));
    setImageSource(p.image_url ? "url" : "url");
    setUploadedFile(null);
    setUploadPreview(null);
    setFormErrors({});
    setOpen(true);
  }

  function validateForm() {
    const nextErrors: Partial<
      Record<
        | "name"
        | "brand"
        | "engineCc"
        | "fuelType"
        | "transmission"
        | "price"
        | "stockQuantity"
        | "imageUrl"
        | "imageFile",
        string
      >
    > = {};
    if (form.name.trim().length < 2) {
      nextErrors.name = "Enter an item name with at least 2 characters.";
    }
    if (isMotorcycle && !form.brand.trim()) {
      nextErrors.brand = "Enter the motorcycle brand.";
    }
    if (
      isMotorcycle &&
      form.fuel_type !== "Electric" &&
      (!form.engine_cc.trim() ||
        !Number.isFinite(Number(form.engine_cc)) ||
        Number(form.engine_cc) <= 0)
    ) {
      nextErrors.engineCc = "Enter an engine displacement greater than 0 cc.";
    }
    if (isMotorcycle && !["FI", "Carbureted", "Electric"].includes(form.fuel_type)) {
      nextErrors.fuelType = "Select a fuel type.";
    }
    if (isMotorcycle && !["Manual", "Semi-Automatic", "Automatic"].includes(form.transmission)) {
      nextErrors.transmission = "Select a transmission type.";
    }
    if (!isMotorcycle && !editing && !hasValidNewPrice) {
      nextErrors.price = "Enter a valid price of PHP 0 or more.";
    }
    if (!hasValidStockQuantity) {
      nextErrors.stockQuantity = "Enter a whole stock quantity of 0 or more.";
    }
    if (imageSource === "url" && form.image_url.trim()) {
      try {
        new URL(form.image_url.trim());
      } catch {
        nextErrors.imageUrl =
          "Enter a valid image URL, including https://, or choose Local Storage.";
      }
    }
    if (imageSource === "local" && uploadedFile && !uploadedFile.type.startsWith("image/")) {
      nextErrors.imageFile = "Choose a valid image file.";
    }
    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
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
                setFilterModel(ALL_MODELS);
              }}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_BRANDS}>All brands</SelectItem>
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
            <Select
              value={filterModel}
              onValueChange={setFilterModel}
              disabled={filterBrand === ALL_BRANDS}
            >
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue
                  placeholder={filterBrand !== ALL_BRANDS ? "All models" : "Select a brand first"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_MODELS}>All models</SelectItem>
                {distinctModelsForBrand.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m.replace(new RegExp(`^${filterBrand} `), "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(filterBrand !== ALL_BRANDS || filterModel !== ALL_MODELS) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setFilterBrand(ALL_BRANDS);
                setFilterModel(ALL_MODELS);
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
                <SelectItem value={ALL_BRANDS}>All brands</SelectItem>
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

          {(filterBrand !== ALL_BRANDS || filterStock !== "all") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setFilterBrand(ALL_BRANDS);
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
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                  setFormErrors((current) => ({ ...current, name: undefined }));
                }}
                aria-invalid={!!formErrors.name}
              />
              <FieldError message={formErrors.name} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`product-brand-${category}`}>Brand</Label>
              <Select
                value={
                  isCustomBrand ? NEW_BRAND : form.brand || (isMotorcycle ? NEW_BRAND : NO_BRAND)
                }
                onValueChange={(value) => {
                  if (value === NEW_BRAND) {
                    setIsCustomBrand(true);
                    setForm({ ...form, brand: "" });
                  } else if (value === NO_BRAND) {
                    setIsCustomBrand(false);
                    setForm({ ...form, brand: "" });
                  } else {
                    setIsCustomBrand(false);
                    setForm({ ...form, brand: value });
                  }
                  setFormErrors((current) => ({ ...current, brand: undefined }));
                }}
              >
                <SelectTrigger id={`product-brand-${category}`} aria-invalid={!!formErrors.brand}>
                  <SelectValue placeholder="Select a brand" />
                </SelectTrigger>
                <SelectContent>
                  {!isMotorcycle && <SelectItem value={NO_BRAND}>No brand</SelectItem>}
                  {brandOptions.map((brand) => (
                    <SelectItem key={brand} value={brand}>
                      {brand}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_BRAND}>Add a new brand…</SelectItem>
                </SelectContent>
              </Select>
              <FieldError message={formErrors.brand} />
              {isCustomBrand && (
                <Input
                  value={form.brand}
                  onChange={(e) => {
                    setForm({ ...form, brand: e.target.value });
                    setFormErrors((current) => ({ ...current, brand: undefined }));
                  }}
                  placeholder="Enter a new brand"
                  aria-label="New brand"
                />
              )}
              <p className="text-xs text-muted-foreground">
                Select an existing brand or add a new one.
              </p>
            </div>
            {isMotorcycle && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="motorcycle-engine-cc">Engine displacement (CC)</Label>
                  <Input
                    id="motorcycle-engine-cc"
                    type="number"
                    min="1"
                    step="0.1"
                    inputMode="decimal"
                    value={form.engine_cc}
                    disabled={form.fuel_type === "Electric"}
                    onChange={(e) => {
                      setForm({ ...form, engine_cc: e.target.value });
                      setFormErrors((current) => ({ ...current, engineCc: undefined }));
                    }}
                    placeholder={form.fuel_type === "Electric" ? "N/A for electric" : "e.g. 155"}
                    aria-invalid={!!formErrors.engineCc}
                  />
                  <FieldError message={formErrors.engineCc} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="motorcycle-fuel-type">Fuel / Power Type</Label>
                  <Select
                    value={form.fuel_type}
                    onValueChange={(value: "FI" | "Carbureted" | "Electric") => {
                      setForm({
                        ...form,
                        fuel_type: value,
                        engine_cc: value === "Electric" ? "" : form.engine_cc,
                      });
                      setFormErrors((current) => ({ ...current, fuelType: undefined }));
                    }}
                  >
                    <SelectTrigger id="motorcycle-fuel-type" aria-invalid={!!formErrors.fuelType}>
                      <SelectValue placeholder="Select fuel type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FI">FI</SelectItem>
                      <SelectItem value="Carbureted">Carbureted</SelectItem>
                      <SelectItem value="Electric">Electric</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError message={formErrors.fuelType} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="motorcycle-transmission">Transmission</Label>
                  <Select
                    value={form.transmission}
                    onValueChange={(value: "Manual" | "Semi-Automatic" | "Automatic") => {
                      setForm({ ...form, transmission: value });
                      setFormErrors((current) => ({ ...current, transmission: undefined }));
                    }}
                  >
                    <SelectTrigger
                      id="motorcycle-transmission"
                      aria-invalid={!!formErrors.transmission}
                    >
                      <SelectValue placeholder="Select transmission" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Manual">Manual</SelectItem>
                      <SelectItem value="Semi-Automatic">Semi-Automatic</SelectItem>
                      <SelectItem value="Automatic">Automatic</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError message={formErrors.transmission} />
                </div>
              </div>
            )}
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
                      onChange={(e) => {
                        setForm({ ...form, image_url: e.target.value });
                        setFormErrors((current) => ({ ...current, imageUrl: undefined }));
                      }}
                      placeholder="https://"
                      aria-invalid={!!formErrors.imageUrl}
                    />
                    <FieldError message={formErrors.imageUrl} />
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
                        setFormErrors((current) => ({ ...current, imageFile: undefined }));
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => setUploadPreview(reader.result as string);
                          reader.readAsDataURL(file);
                        } else {
                          setUploadPreview(null);
                        }
                      }}
                      aria-invalid={!!formErrors.imageFile}
                    />
                    <FieldError message={formErrors.imageFile} />
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
            {!isMotorcycle && editing && (
              <p className="text-xs text-muted-foreground">
                Current price: {formatPHP(editing.price)}. To change it, use{" "}
                <a href="/admin/prices" className="underline">
                  Price Management
                </a>{" "}
                only.
              </p>
            )}
            {!isMotorcycle && (
              <div className="space-y-1.5">
                <Label>Stock Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={form.stock_quantity}
                  onChange={(e) => {
                    setForm({ ...form, stock_quantity: e.target.value });
                    setFormErrors((current) => ({ ...current, stockQuantity: undefined }));
                  }}
                  placeholder="0"
                  aria-invalid={!!formErrors.stockQuantity}
                />
                <FieldError message={formErrors.stockQuantity} />
                <p className="text-xs text-muted-foreground">
                  Set to 0 to show this item as Out of Stock to customers.
                </p>
              </div>
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
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select
                      value={form.is_active ? "active" : "deactivated"}
                      onValueChange={(value) => setForm({ ...form, is_active: value === "active" })}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="deactivated">Deactivated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Toggle
                    label="Featured"
                    checked={form.is_featured}
                    onChange={(v) => setForm({ ...form, is_featured: v })}
                  />
                </>
              )}
              {isMotorcycle && (
                <Toggle
                  label="Visible in booking"
                  checked={form.is_active}
                  onChange={(v) => setForm({ ...form, is_active: v })}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
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

      <Card className={cn("border-border/70 bg-card/60", isMotorcycle && "max-w-7xl")}>
        <CardContent className="overflow-x-auto p-0">
          <Table className={cn("admin-data-table", isMotorcycle && "admin-balanced-table")}>
            {isMotorcycle && (
              <colgroup>
                <col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "8%" }} />
              </colgroup>
            )}
            <TableHeader>
              <TableRow>
                {isMotorcycle && <TableHead>Date Created</TableHead>}
                {isMotorcycle && <TableHead>Brand</TableHead>}
                <TableHead>{isMotorcycle ? "Model" : "Item"}</TableHead>
                {!isMotorcycle && <TableHead>Brand</TableHead>}
                {isMotorcycle && <TableHead>CC</TableHead>}
                {isMotorcycle && <TableHead>Fuel / Power Type</TableHead>}
                {isMotorcycle && <TableHead>Transmission</TableHead>}
                {!isMotorcycle && <TableHead>Price</TableHead>}
                {!isMotorcycle && <TableHead>Status</TableHead>}
                {!isMotorcycle && <TableHead>Featured</TableHead>}
                {!isMotorcycle && (
                  <TableHead className="w-20 whitespace-nowrap text-center">
                    Stock Quantity
                  </TableHead>
                )}
                <TableHead
                  className={cn("whitespace-nowrap text-center", !isMotorcycle && "w-20 pl-0")}
                >
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((p) => (
                <TableRow key={p.id}>
                  {isMotorcycle && (
                    <TableCell
                      data-label="Created on"
                      className="whitespace-nowrap text-xs text-muted-foreground"
                    >
                      {formatModelCreatedOn(p.created_at)}
                    </TableCell>
                  )}
                  {isMotorcycle && (
                    <TableCell data-label="Brand" className="text-sm">
                      {p.brand ?? "-"}
                    </TableCell>
                  )}
                  {isMotorcycle && (
                    <TableCell data-label="Model">
                      <span className="block text-sm">{modelName(p)}</span>
                    </TableCell>
                  )}
                  {!isMotorcycle && (
                    <TableCell data-label="Item">
                      <span className="block text-sm">{p.name}</span>
                      <span className="text-xs text-muted-foreground capitalize">{p.category}</span>
                    </TableCell>
                  )}
                  {!isMotorcycle && (
                    <TableCell data-label="Brand" className="text-sm">
                      {p.brand ?? "-"}
                    </TableCell>
                  )}
                  {isMotorcycle && (
                    <TableCell data-label="CC" className="text-sm">
                      {formatEngineCc(p.engine_cc, p.fuel_type)}
                    </TableCell>
                  )}
                  {isMotorcycle && (
                    <TableCell data-label="Fuel / Power Type" className="text-sm">
                      {p.fuel_type ?? "-"}
                    </TableCell>
                  )}
                  {isMotorcycle && (
                    <TableCell data-label="Transmission" className="text-sm">
                      {p.transmission ?? "-"}
                    </TableCell>
                  )}
                  {!isMotorcycle && (
                    <TableCell data-label="Price" className="text-sm text-primary">
                      {formatPHP(p.price)}
                    </TableCell>
                  )}
                  {!isMotorcycle && (
                    <TableCell data-label="Status">
                      <Badge
                        variant="outline"
                        className={`uppercase ${activeStatusTone(p.is_active)}`}
                      >
                        {p.is_active ? "Active" : "Deactivated"}
                      </Badge>
                    </TableCell>
                  )}
                  {!isMotorcycle && (
                    <TableCell data-label="Featured">
                      {p.is_featured ? (
                        <Badge className="bg-primary text-primary-foreground uppercase">
                          Featured
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  )}
                  {!isMotorcycle && (
                    <TableCell
                      data-label="Stock Quantity"
                      className="w-20 text-center font-mono text-sm"
                    >
                      {p.stock_quantity.toLocaleString()}
                    </TableCell>
                  )}
                  <TableCell
                    data-label="Actions"
                    className={cn(
                      "space-x-1 whitespace-nowrap text-center",
                      !isMotorcycle && "w-20 pl-0",
                    )}
                  >
                    <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setArchiveTarget(p.id)}>
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
      <ArchiveConfirmationDialog
        open={Boolean(archiveTarget)}
        recordLabel={isMotorcycle ? "motorcycle catalog item" : "part or accessory"}
        pending={archive.isPending}
        onOpenChange={(nextOpen) => !nextOpen && setArchiveTarget(null)}
        onConfirm={() => {
          if (archiveTarget) archive.mutate(archiveTarget);
          setArchiveTarget(null);
        }}
      />
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

function formatModelCreatedOn(createdAt: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(createdAt));
}

function modelName(product: Pick<Product, "name" | "brand">) {
  const brandPrefix = product.brand ? `${product.brand} ` : "";
  return product.name.startsWith(brandPrefix)
    ? product.name.slice(brandPrefix.length)
    : product.name;
}

function formatEngineCc(engineCc: number | null, fuelType: Product["fuel_type"]) {
  if (fuelType === "Electric") return "N/A";
  if (!engineCc) return "-";
  return `${engineCc <= 500 ? "Small CC" : "Big CC"} (${engineCc.toLocaleString()}cc)`;
}
