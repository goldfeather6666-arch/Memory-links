"use client";

import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

gsap.registerPlugin(ScrollTrigger);

export default function SmoothScroll({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.2,
      smoothWheel: true,
    });

    lenis.on("scroll", ScrollTrigger.update);

    const update = (time: number) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);

    document.documentElement.classList.add("lenis");

    // Delegated document-level handler for in-page anchors. Intercepts
    // `a[href^="#"]` and hands the scroll to Lenis so navigation matches the
    // site's smooth-scroll feel instead of jumping instantly.
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest?.(
        'a[href^="#"]',
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href === "#" || href.length < 2) return;
      const el = document.querySelector(href);
      if (!el) return;
      event.preventDefault();
      lenis.scrollTo(el as HTMLElement, { duration: 1.2 });
      // Keep the URL in sync with the target anchor (Lenis handles the scroll,
      // so we update history without triggering a native jump).
      try {
        window.history.pushState(null, "", href);
      } catch {
        // Ignore environments where history is restricted (e.g. sandboxed iframes).
      }
    };
    document.addEventListener("click", handleClick);

    return () => {
      document.removeEventListener("click", handleClick);
      document.documentElement.classList.remove("lenis");
      gsap.ticker.remove(update);
      lenis.destroy();
    };
  }, [reducedMotion]);

  return <>{children}</>;
}
