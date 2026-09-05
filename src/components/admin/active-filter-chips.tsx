import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

type ActiveFilter = {
  label: string;
  value: string;
  onClear: () => void;
};

type ActiveFilterChipsProps = {
  filters: ActiveFilter[];
  onReset: () => void;
};

export function ActiveFilterChips({ filters, onReset }: ActiveFilterChipsProps) {
  if (filters.length === 0) return null;

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-sm"
      aria-label="Active filters"
    >
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Active filters
      </span>
      {filters.map((filter) => (
        <Button
          key={`${filter.label}-${filter.value}`}
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 max-w-full gap-1 rounded-full px-2 text-xs"
          onClick={filter.onClear}
          title={`Remove ${filter.label} filter`}
        >
          <span className="truncate">
            {filter.label}: {filter.value}
          </span>
          <X className="size-3 shrink-0" />
        </Button>
      ))}
      <Button type="button" variant="ghost" size="sm" className="ml-auto h-7" onClick={onReset}>
        Reset filters
      </Button>
    </div>
  );
}
