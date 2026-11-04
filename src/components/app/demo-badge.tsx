import { Badge } from "@/components/ui/badge";

/** Small indicator used on demo records and surfaces. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge variant="violet" className={className}>
      DEMO DATA
    </Badge>
  );
}
