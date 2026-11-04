import type { ReactNode } from "react";
import SmoothScroll from "@/lib/smooth-scroll";
import Nav from "@/components/nav";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <SmoothScroll>
      <Nav />
      {children}
    </SmoothScroll>
  );
}
