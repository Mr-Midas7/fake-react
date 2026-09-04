import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw, Trash2 } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
import { PaginationControls } from "@/components/admin/pagination-controls";
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
  const pageSize = 25;
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [activeTab, setActiveTab] = useState("appointments");
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: string } | null>(null);
  const deferredTerm = useDeferredValue(term);
  const searchTerm = cleanSearchTerm(deferredTerm);

  const archived = useQuery({
    queryKey: ["archived-appointments", { searchTerm, page }],
    queryFn: async () => {
      let query = supabase
        .from("appointments")
        .select("*", { count: "exact" })
        .eq("is_archived", true)
        .order("appointment_date", { ascending: false });
      if (searchTerm)
        query = query.or(
          `reference_code.ilike.%${searchTerm}%,customer_name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,plate_number.ilike.%${searchTerm}%`,
        );
      const { data, error, count } = await query.range(
        page * pageSize,
        page * pageSize + pageSize - 1,
      );
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
    enabled: activeTab === "appointments",
  });

  const archivedServices = useQuery({
    queryKey: ["archived-services", { searchTerm, page }],
    queryFn: async () => {
      let query = supabase
        .from("services")
        .select("*", { count: "exact" })
        .eq("is_archived", true)
        .order("sort_order");
      if (searchTerm) query = query.ilike("name", `%${searchTerm}%`);
      const { data, error, count } = await query.range(
        page * pageSize,
        page * pageSize + pageSize - 1,
      );
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
    enabled: activeTab === "services",
  });

  const archivedProducts = useQuery({
    queryKey: ["archived-products", { searchTerm, page }],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("*", { count: "exact" })
        .in("category", ["part", "accessory"])
        .eq("is_archived", true)
        .order("sort_order");
      if (searchTerm) query = query.or(`name.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%`);
      const { data, error, count } = await query.range(
        page * pageSize,
        page * pageSize + pageSize - 1,
      );
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
    enabled: activeTab === "products",
  });

  const archivedMotorcycles = useQuery({
    queryKey: ["archived-motorcycles", { searchTerm, page }],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("*", { count: "exact" })
        .eq("category", "motorcycle")
        .eq("is_archived", true)
        .order("brand")
        .order("name");
      if (searchTerm) query = query.or(`name.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%`);
      const { data, error, count } = await query.range(
        page * pageSize,
        page * pageSize + pageSize - 1,
      );
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
    enabled: activeTab === "motorcycles",
  });

  const archivedCrew = useQuery({
    queryKey: ["archived-crew", { searchTerm, page }],
    queryFn: async () => {
      let query = supabase
        .from("crew_members")
        .select("*", { count: "exact" })
        .eq("is_archived", true)
        .order("name");
      if (searchTerm)
        query = query.or(
          `name.ilike.%${searchTerm}%,role.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`,
        );
      const { data, error, count } = await query.range(
        page * pageSize,
        page * pageSize + pageSize - 1,
      );
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
    enabled: activeTab === "crew",
  });

  const archivedBlocks = useQuery({
    queryKey: ["archived-blocks", { searchTerm, page }],
    queryFn: async () => {
      let query = supabase
        .from("schedule_blocks")
        .select("*", { count: "exact" })
        .eq("is_active", false)
        .order("block_date", { ascending: false });
      if (searchTerm) query = query.ilike("reason", `%${searchTerm}%`);
      const { data, error, count } = await query.range(
        page * pageSize,
        page * pageSize + pageSize - 1,
      );
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
    enabled: activeTab === "blocks",
  });

  const archivedBlockedNumbers = useQuery({
    queryKey: ["archived-blocked-numbers", { searchTerm, page }],
    queryFn: async () => {
      let query = supabase
        .from("blocked_numbers")
        .select("*", { count: "exact" })
        .eq("is_archived", true)
        .order("created_at", { ascending: false });
      if (searchTerm) query = query.or(`phone.ilike.%${searchTerm}%,reason.ilike.%${searchTerm}%`);
      const { data, error, count } = await query.range(
        page * pageSize,
        page * pageSize + pageSize - 1,
      );
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
    enabled: activeTab === "blocked-numbers",
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
      const { error } = await supabase.from("services").update({ is_archived: false }).eq("id", id);
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
      const { error } = await supabase.from("products").update({ is_archived: false }).eq("id", id);
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
        .update({ is_archived: false })
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

  const restoreBlockedNumber = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("blocked_numbers")
        .update({ is_archived: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Blocked number restored.");
      queryClient.invalidateQueries({ queryKey: ["archived-blocked-numbers"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["blocked-numbers"], exact: false });
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
        blockedNumber: "blocked_numbers",
      };
      const table = tables[type] as
        | "appointments"
        | "services"
        | "products"
        | "crew_members"
        | "schedule_blocks"
        | "blocked_numbers";
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
      queryClient.invalidateQueries({ queryKey: ["archived-blocked-numbers"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["admin-services"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["admin-products"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["crew-all"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["schedule-blocks"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["blocked-numbers"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["motorcycle-catalog"], exact: false });
    },
    onError: (err: Error) => {
      console.error("Delete failed:", err);
      toast.error(`Delete failed: ${err.message}`);
    },
  });

  useEffect(() => {
    setPage(0);
  }, [activeTab, term]);

  const appointmentRows = archived.data?.rows ?? [];
  const serviceRows = archivedServices.data?.rows ?? [];
  const productRows = archivedProducts.data?.rows ?? [];
  const motorcycleRows = archivedMotorcycles.data?.rows ?? [];
  const crewRows = archivedCrew.data?.rows ?? [];
  const blockRows = archivedBlocks.data?.rows ?? [];
  const blockedNumberRows = archivedBlockedNumbers.data?.rows ?? [];
  const activeArchive = {
    appointments: archived.data,
    services: archivedServices.data,
    products: archivedProducts.data,
    motorcycles: archivedMotorcycles.data,
    crew: archivedCrew.data,
    blocks: archivedBlocks.data,
    "blocked-numbers": archivedBlockedNumbers.data,
  }[activeTab];

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
        description="Archived bookings, services, products, crew, schedule blocks, and blocked numbers. Restore them or delete permanently."
      />
      <Input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search the selected archive"
        className="mb-4 max-w-xs"
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
            <TabsTrigger value="blocked-numbers">Blocked Numbers</TabsTrigger>
          </TabsList>
        </div>

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

        <TabsContent value="blocked-numbers">
          <Card className="border-border/70 bg-card/60">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Blocked on</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blockedNumberRows.map((blockedNumber) => (
                    <TableRow key={blockedNumber.id}>
                      <TableCell className="font-mono text-sm">{blockedNumber.phone}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {blockedNumber.reason ?? "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(blockedNumber.created_at).toLocaleDateString("en-PH", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="flex justify-end gap-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => restoreBlockedNumber.mutate(blockedNumber.id)}
                        >
                          <RotateCcw /> Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => confirmDelete(blockedNumber.id, "blockedNumber")}
                        >
                          <Trash2 /> Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {blockedNumberRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        {archivedBlockedNumbers.isLoading
                          ? "Loading archive..."
                          : "No archived blocked numbers."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={activeArchive?.total ?? 0}
        onPageChange={setPage}
      />

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

function cleanSearchTerm(value: string) {
  return value
    .trim()
    .replace(/[,%_()]/g, " ")
    .replace(/\s+/g, " ");
}
