import type { LabelHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "block text-sm font-medium text-slate mb-1.5 select-none",
        className,
      )}
      {...props}
    />
  );
}
