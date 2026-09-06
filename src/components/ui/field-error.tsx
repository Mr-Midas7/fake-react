import { CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/** Consistent inline validation feedback for every form field. */
export function FieldError({
  message,
  className,
}: {
  message?: string | undefined;
  className?: string | undefined;
}) {
  if (!message) return null;

  return (
    <p role="alert" className={cn("flex items-center gap-1 text-xs text-destructive", className)}>
      <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}
