'use client';
import { useEffect, useRef, useState } from 'react';
export function useInView<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      rootMargin: '0px 0px -12% 0px',
      threshold: 0,
      ...optionsRef.current,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, inView };
}
