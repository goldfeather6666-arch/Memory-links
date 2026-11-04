import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/utils/cn";

type GlassCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export default function GlassCard({ className, children, ...props }: GlassCardProps) {
  return (
    <div className={cn("glass rounded-2xl p-6", className)} {...props}>
      {children}
    </div>
  );
}
