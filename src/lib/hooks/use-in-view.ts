'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
export function useInView<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const opts = useMemo(
    () => ({ rootMargin: '0px 0px -12% 0px', threshold: 0, ...options }),
    [options],
  );
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), opts);
    io.observe(el);
    return () => io.disconnect();
  }, [opts]);
  return { ref, inView };
}
