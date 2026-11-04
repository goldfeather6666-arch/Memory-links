import type { HTMLAttributes } from "react";
import { cn } from "@/utils/cn";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "violet" | "subtle" | "danger";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants: Record<string, string> = {
    default: "bg-soft-white/10 text-slate",
    violet: "bg-violet/20 text-violet",
    subtle: "bg-midnight/60 text-slate border border-soft-white/10",
    danger: "bg-red-500/15 text-red-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
