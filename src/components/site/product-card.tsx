import { Bike, ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatPHP } from "@/lib/shop";

export type ProductRow = {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  description: string | null;
  price: number | string;
  image_url: string | null;
  in_stock: boolean;
  is_featured: boolean;
};

export function ProductCard({ product }: { product: ProductRow }) {
  return (
    <Card className="group overflow-hidden border-border/70 bg-card/70 py-0 transition-colors hover:border-primary/60">
      <div className="relative flex h-44 items-center justify-center overflow-hidden bg-secondary/50">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : product.category === "motorcycle" ? (
          <Bike className="h-14 w-14 text-muted-foreground/50" />
        ) : (
          <ImageIcon className="h-12 w-12 text-muted-foreground/50" />
        )}
        {product.is_featured && (
          <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground uppercase">
            Featured
          </Badge>
        )}
        {!product.in_stock && (
          <Badge variant="outline" className="absolute top-2 right-2 bg-background/80 uppercase">
            Out of stock
          </Badge>
        )}
      </div>
      <CardContent className="p-4 pb-5">
        <p className="text-xs tracking-widest text-accent uppercase">
          {product.brand ?? product.category}
        </p>
        <h3 className="mt-1 font-display text-lg leading-tight tracking-wide uppercase">
          {product.name}
        </h3>
        {product.description && (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
        )}
        <p className="mt-3 font-display text-xl text-primary">{formatPHP(product.price)}</p>
      </CardContent>
    </Card>
  );
}
