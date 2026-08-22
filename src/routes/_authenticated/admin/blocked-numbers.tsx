import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/admin/page-header";
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
import { phoneSchema } from "@/lib/shop";

type BlockedNumber = {
  id: string;
  phone: string;
  reason: string | null;
  created_at: string;
  created_by: string | null;
};

export const Route = createFileRoute("/_authenticated/admin/blocked-numbers")({
  component: BlockedNumbersPage,
});

function BlockedNumbersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");

  const blocked = useQuery({
    queryKey: ["blocked-numbers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blocked_numbers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BlockedNumber[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("blocked_numbers").insert({
        phone,
        reason: reason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Number blocked");
      setPhone("");
      setReason("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["blocked-numbers"] });
    },
    onError: (err: Error) => {
      const msg = err.message.toLowerCase();
      if (msg.includes("unique") || msg.includes("duplicate")) {
        toast.error("This phone number is already blocked.");
      } else {
        console.error("Block failed:", err);
        toast.error(`Could not block the number: ${err.message}`);
      }
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blocked_numbers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Number unblocked");
      qc.invalidateQueries({ queryKey: ["blocked-numbers"] });
    },
    onError: (err: Error) => {
      console.error("Remove failed:", err);
      toast.error(`Could not unblock the number: ${err.message}`);
    },
  });

  const handleAdd = async () => {
    const trimmed = phone.trim();
    try {
      phoneSchema.parse(trimmed);
    } catch {
      toast.error("Enter a valid PH mobile number (09XXXXXXXXX)");
      return;
    }
    await add.mutate();
  };

  return (
    <div>
      <PageHeader
        title="Blocked Numbers"
        description="Phone numbers blocked from booking online."
        action={
          <Button
            className="font-display uppercase"
            onClick={() => {
              setPhone("");
              setReason("");
              setOpen(true);
            }}
          >
            <Plus /> Block number
          </Button>
        }
      />

      <Card className="border-border/70 bg-card/60">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Blocked on</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blocked.data?.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-sm">{b.phone}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.reason || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(b.created_at).toLocaleDateString("en-PH", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove.mutate(b.id)}
                      disabled={remove.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {blocked.data?.length === 0 && !blocked.isLoading && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No blocked numbers.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display uppercase">Block a number</DialogTitle>
            <DialogDescription>
              Blocked numbers cannot book online. They’ll need to call the shop.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Phone number</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09XXXXXXXXX"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="No-shows, abusive behaviour, etc."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={add.isPending || !phone.trim()}>
              {add.isPending ? "Blocking…" : "Block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
