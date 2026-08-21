import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useRef } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { ProductManager, ProductManagerHandle } from "@/components/admin/product-manager";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/motorcycles")({
  component: MotorcyclesAdmin,
});

function MotorcyclesAdmin() {
  const productManagerRef = useRef<ProductManagerHandle>(null);

  return (
    <div>
      <PageHeader
        title="Motorcycle Catalog"
        description="Manage motorcycle brands and models shown in the booking form."
        action={
          <Button
            className="font-display uppercase"
            onClick={() => productManagerRef.current?.openNew()}
          >
            <Plus /> Add item
          </Button>
        }
      />
      <ProductManager ref={productManagerRef} category="motorcycle" />
    </div>
  );
}
