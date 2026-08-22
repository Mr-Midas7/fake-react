import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
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
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
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
import { formatDateLong, formatPHP, formatTime, statusLabel, statusTone } from "@/lib/shop";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/archive")({
  component: ArchivePage,
});

function ArchivePage() {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [activeTab, setActiveTab] = useState("appointments");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: string } | null>(null);

  const archived = useQuery({
    queryKey: ["archived-appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("is_archived", true)
        .order("appointment_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const archivedServices = useQuery({
    queryKey: ["archived-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("is_active", false)
        .order("sort_order");
      if (error) throw error;
      return Array.from(new Map((data ?? []).map((s) => [s.name.trim(), s])).values());
    },
  });

  const archivedProducts = useQuery({
    queryKey: ["archived-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .in("category", ["part", "accessory"])
        .eq("is_active", false)
        .order("sort_order");
      if (error) throw error;
      return Array.from(new Map((data ?? []).map((p) => [p.name.trim(), p])).values());
    },
  });

  const archivedMotorcycles = useQuery({
    queryKey: ["archived-motorcycles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("category", "motorcycle")
        .eq("is_active", false)
        .order("brand")
        .order("name");
      if (error) throw error;
      return Array.from(new Map((data ?? []).map((p) => [p.name.trim(), p])).values());
    },
  });

  const archivedCrew = useQuery({
    queryKey: ["archived-crew"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crew_members")
        .select("*")
        .eq("is_active", false)
        .order("name");
      if (error) throw error;
      return Array.from(new Map((data ?? []).map((c) => [c.name.trim(), c])).values());
    },
  });

  const archivedBlocks = useQuery({
    queryKey: ["archived-blocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_blocks")
        .select("*")
        .eq("is_active", false)
        .order("block_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const restoreAppointment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("appointments")
        .update({ is_archived: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Appointment restored.");
      queryClient.invalidateQueries({ queryKey: ["archived-appointments"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"], exact: false });
    },
    onError: (err: Error) => {
      console.error("Restore failed:", err);
      toast.error(`Restore failed: ${err.message}`);
    },
  });

  const restoreService = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").update({ is_active: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service restored.");
      queryClient.invalidateQueries({ queryKey: ["archived-services"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["admin-services"], exact: false });
    },
    onError: (err: Error) => {
      console.error("Restore failed:", err);
      toast.error(`Restore failed: ${err.message}`);
    },
  });

  const restoreProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").update({ is_active: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product restored.");
      queryClient.invalidateQueries({ queryKey: ["archived-products"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["archived-motorcycles"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["admin-products"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["motorcycle-catalog"], exact: false });
    },
    onError: (err: Error) => {
      console.error("Restore failed:", err);
      toast.error(`Restore failed: ${err.message}`);
    },
  });

  const restoreCrew = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("crew_members")
        .update({ is_active: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Crew member restored.");
      queryClient.invalidateQueries({ queryKey: ["archived-crew"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["crew-all"], exact: false });
    },
    onError: (err: Error) => {
      console.error("Restore failed:", err);
      toast.error(`Restore failed: ${err.message}`);
    },
  });

  const restoreBlock = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("schedule_blocks")
        .update({ is_active: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Schedule block restored.");
      queryClient.invalidateQueries({ queryKey: ["archived-blocks"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["schedule-blocks"], exact: false });
    },
    onError: (err: Error) => {
      console.error("Restore failed:", err);
      toast.error(`Restore failed: ${err.message}`);
    },
  });

  const deleteItem = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: string }) => {
      const tables: Record<string, string> = {
        appointment: "appointments",
        service: "services",
        product: "products",
        crew: "crew_members",
        block: "schedule_blocks",
      };
      const table = tables[type] as
        "appointments" | "services" | "products" | "crew_members" | "schedule_blocks";
      if (!table) throw new Error(`Unknown type: ${type}`);
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setDeleteTarget(null);
      toast.success("Item permanently deleted.");
      queryClient.invalidateQueries({ queryKey: ["archived-appointments"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["archived-services"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["archived-products"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["archived-motorcycles"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["archived-crew"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["archived-blocks"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["admin-services"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["admin-products"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["crew-all"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["schedule-blocks"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["motorcycle-catalog"], exact: false });
    },
    onError: (err: Error) => {
      console.error("Delete failed:", err);
      toast.error(`Delete failed: ${err.message}`);
    },
  });

  const appointmentRows = (archived.data ?? []).filter((a) => {
    if (term.trim() === "") return true;
    return `${a.reference_code} ${a.customer_name} ${a.phone} ${a.plate_number}`
      .toLowerCase()
      .includes(term.toLowerCase());
  });

  const serviceRows = (archivedServices.data ?? []).filter((s) => {
    if (term.trim() === "") return true;
    return `${s.name}`.toLowerCase().includes(term.toLowerCase());
  });

  const productRows = (archivedProducts.data ?? []).filter((p) => {
    if (term.trim() === "") return true;
    return `${p.name} ${p.brand ?? ""}`.toLowerCase().includes(term.toLowerCase());
  });

  const motorcycleRows = (archivedMotorcycles.data ?? []).filter((p) => {
    if (term.trim() === "") return true;
    return `${p.brand ?? ""} ${p.name}`.toLowerCase().includes(term.toLowerCase());
  });
  const crewRows = (archivedCrew.data ?? []).filter((c) => {
    if (term.trim() === "") return true;
    return `${c.name} ${c.role} ${c.phone ?? ""}`.toLowerCase().includes(term.toLowerCase());
  });

  const blockRows = (archivedBlocks.data ?? []).filter((b) => {
    if (term.trim() === "") return true;
    return `${b.block_date} ${b.reason ?? ""}`.toLowerCase().includes(term.toLowerCase());
  });

  const confirmDelete = (id: string, type: string) => {
    setDeleteTarget({ id, type });
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteItem.mutate(deleteTarget);
    }
  };

  return (
    <div>
      <PageHeader
        title="Archive"
        description="Archived bookings, services, products, crew, and schedule blocks. Restore them or delete permanently."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="overflow-x-auto overflow-y-visible">
          <TabsList className="mb-4 w-max min-w-full">
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="motorcycles">Motorcycles</TabsTrigger>
            <TabsTrigger value="crew">Pit Crew</TabsTrigger>
            <TabsTrigger value="blocks">Schedule Blocks</TabsTrigger>
          </TabsList>
        </div>

        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search..."
          className="mb-4 max-w-sm"
        />

        <TabsContent value="appointments">
          <Card className="border-border/70 bg-card/60">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Estimate</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointmentRows.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">{a.reference_code}</TableCell>
                      <TableCell className="text-sm">
                        {a.customer_name}
                        <span className="block text-xs text-muted-foreground">
                          {a.moto_brand} {a.moto_model} · {a.plate_number}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDateLong(a.appointment_date)}
                        <span className="block text-muted-foreground">
                          {formatTime(String(a.start_time).slice(0, 5))}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] uppercase", statusTone(a.status))}
                        >
                          {statusLabel(a.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatPHP(a.total_estimate)}</TableCell>
                      <TableCell className="flex justify-end gap-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => restoreAppointment.mutate(a.id)}
                        >
                          <RotateCcw /> Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => confirmDelete(a.id, "appointment")}
                        >
                          <Trash2 /> Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {appointmentRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        {archived.isLoading ? "Loading archive..." : "Nothing archived yet."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services">
          <Card className="border-border/70 bg-card/60">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serviceRows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm font-medium">{s.name}</TableCell>
                      <TableCell className="text-sm">{s.duration_minutes} mins</TableCell>
                      <TableCell className="text-sm text-primary">{formatPHP(s.price)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.description ?? "-"}
                      </TableCell>
                      <TableCell className="flex justify-end gap-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => restoreService.mutate(s.id)}
                        >
                          <RotateCcw /> Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => confirmDelete(s.id, "service")}
                        >
                          <Trash2 /> Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {serviceRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        {archivedServices.isLoading
                          ? "Loading archive..."
                          : "No archived services."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <Card className="border-border/70 bg-card/60">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productRows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <span className="block text-sm">{p.name}</span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {p.category}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{p.brand ?? "-"}</TableCell>
                      <TableCell className="text-sm text-primary">{formatPHP(p.price)}</TableCell>
                      <TableCell className="text-sm capitalize">{p.category}</TableCell>
                      <TableCell className="flex justify-end gap-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => restoreProduct.mutate(p.id)}
                        >
                          <RotateCcw /> Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => confirmDelete(p.id, "product")}
                        >
                          <Trash2 /> Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {productRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        {archivedProducts.isLoading
                          ? "Loading archive..."
                          : "No archived products."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="motorcycles">
          <Card className="border-border/70 bg-card/60">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {motorcycleRows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm font-medium">{p.name}</TableCell>
                      <TableCell className="text-sm">{p.brand ?? "-"}</TableCell>
                      <TableCell className="flex justify-end gap-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => restoreProduct.mutate(p.id)}
                        >
                          <RotateCcw /> Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => confirmDelete(p.id, "product")}
                        >
                          <Trash2 /> Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {motorcycleRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        {archivedMotorcycles.isLoading
                          ? "Loading archive..."
                          : "No archived motorcycles."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="crew">
          <Card className="border-border/70 bg-card/60">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crewRows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">{c.name}</TableCell>
                      <TableCell className="text-sm">{c.role}</TableCell>
                      <TableCell className="text-sm">{c.phone ?? "-"}</TableCell>
                      <TableCell className="flex justify-end gap-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => restoreCrew.mutate(c.id)}
                        >
                          <RotateCcw /> Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => confirmDelete(c.id, "crew")}
                        >
                          <Trash2 /> Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {crewRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        {archivedCrew.isLoading
                          ? "Loading archive..."
                          : "No archived crew members."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blocks">
          <Card className="border-border/70 bg-card/60">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Slot</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blockRows.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-sm">{formatDateLong(b.block_date)}</TableCell>
                      <TableCell className="text-sm">
                        {b.start_time ? formatTime(String(b.start_time).slice(0, 5)) : "Whole day"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {b.reason ?? "-"}
                      </TableCell>
                      <TableCell className="flex justify-end gap-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => restoreBlock.mutate(b.id)}
                        >
                          <RotateCcw /> Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => confirmDelete(b.id, "block")}
                        >
                          <Trash2 /> Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {blockRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        {archivedBlocks.isLoading
                          ? "Loading archive..."
                          : "No archived schedule blocks."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Permanent Delete</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The item will be permanently removed from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Permanently Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
