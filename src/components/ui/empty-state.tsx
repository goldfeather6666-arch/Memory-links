import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-soft-white/15 px-6 py-10 text-center",
        className,
      )}
    >
      {icon && <div className="mb-3 text-violet/60">{icon}</div>}
      <h3 className="text-sm font-medium text-soft-white">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
