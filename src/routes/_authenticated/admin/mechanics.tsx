import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, Pencil, Plus } from "lucide-react";
import { useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/mechanics")({
  component: MechanicsPage,
});

type CrewMember = {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  is_active: boolean;
};

const blank = { name: "", role: "Mechanic", phone: "" };

function MechanicsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CrewMember | null>(null);
  const [form, setForm] = useState({ ...blank });
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterName, setFilterName] = useState("");

  const crew = useQuery({
    queryKey: ["crew-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("crew_members").select("*").order("name");
      if (error) throw error;
      return data as CrewMember[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("crew_members").insert({
        name: form.name.trim(),
        role: form.role.trim() || "Mechanic",
        phone: form.phone.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mechanic added");
      setForm({ ...blank });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["crew-all"] });
    },
    onError: (err: Error) => {
      console.error("Add failed:", err);
      toast.error(`Add failed: ${err.message}`);
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("crew_members")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crew-all"] }),
    onError: (err: Error) => {
      console.error("Update failed:", err);
      toast.error(`Update failed: ${err.message}`);
    },
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("crew_members")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mechanic archived");
      qc.invalidateQueries({ queryKey: ["crew-all"], exact: false });
      qc.invalidateQueries({ queryKey: ["archived-crew"], exact: false });
    },
    onError: (err: Error) => {
      console.error("Archive failed:", err);
      toast.error(`Archive failed: ${err.message}`);
    },
  });

  const getStatus = (c: CrewMember) => {
    if (!c.is_active) return { label: "Inactive", tone: "bg-muted text-muted-foreground" };
    return { label: "Active", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (editing) {
      const { error } = await supabase
        .from("crew_members")
        .update({
          name: form.name.trim(),
          role: form.role.trim() || "Mechanic",
          phone: form.phone.trim() || null,
        })
        .eq("id", editing.id);
      if (error) throw error;
      toast.success("Mechanic updated");
    } else {
      await add.mutate();
    }
    setEditing(null);
    setForm({ ...blank });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["crew-all"] });
  };

  return (
    <div>
      <PageHeader
        title="Mechanics"
        description="Manage mechanics and view their current work status."
        action={
          <Button
            className="font-display uppercase"
            onClick={() => {
              setEditing(null);
              setForm({ ...blank });
              setOpen(true);
            }}
          >
            <Plus /> Add mechanic
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label className="text-sm">Name</Label>
          <Input
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            placeholder="Search by name..."
            className="w-48"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">Status</Label>
          <Select
            value={filterStatus}
            onValueChange={(v) => setFilterStatus(v as "all" | "active" | "inactive")}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(filterStatus !== "all" || filterName) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFilterStatus("all");
              setFilterName("");
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
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {crew.data
                ?.filter((c) => c.name.toLowerCase().includes(filterName.toLowerCase()))
                .filter((c) =>
                  filterStatus === "all"
                    ? true
                    : filterStatus === "active"
                      ? c.is_active
                      : !c.is_active,
                )
                .map((c) => {
                  const status = getStatus(c);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">{c.name}</TableCell>
                      <TableCell className="text-sm">{c.role}</TableCell>
                      <TableCell className="text-sm">{c.phone ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] uppercase ${status.tone}`}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={c.is_active}
                          onCheckedChange={(v) =>
                            update.mutate({ id: c.id, patch: { is_active: v } })
                          }
                        />
                      </TableCell>
                      <TableCell className="space-x-1 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(c);
                            setForm({ name: c.name, role: c.role, phone: c.phone ?? "" });
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => archive.mutate(c.id)}>
                          <Archive className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
          {crew.data?.filter(
            (c) =>
              c.name.toLowerCase().includes(filterName.toLowerCase()) &&
              (filterStatus === "all"
                ? true
                : filterStatus === "active"
                  ? c.is_active
                  : !c.is_active),
          ).length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">No mechanics found.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display uppercase">
              {editing ? "Edit mechanic" : "New mechanic"}
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
              <Label>Role</Label>
              <Input
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={add.isPending || !form.name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
