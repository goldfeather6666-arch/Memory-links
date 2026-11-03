"use client";

import { useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { motion, useSpring } from "motion/react";
import { cn } from "@/utils/cn";

type MagneticButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationRepeat"
  | "onDragStart"
  | "onDrag"
  | "onDragEnd"
  | "onDragOver"
  | "onDragEnter"
  | "onDragLeave"
  | "onPanStart"
  | "onPan"
  | "onPanEnd"
  | "onPanSessionStart"
  | "onTap"
  | "onTapStart"
  | "onTapCancel"
  | "onHoverStart"
  | "onHoverEnd"
> & {
  children: ReactNode;
};

export default function MagneticButton({
  className,
  children,
  onPointerMove,
  onPointerLeave,
  ...props
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);

  const x = useSpring(0, { stiffness: 150, damping: 15, mass: 0.1 });
  const y = useSpring(0, { stiffness: 150, damping: 15, mass: 0.1 });

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const element = ref.current;
    if (element && event.pointerType === "mouse") {
      const rect = element.getBoundingClientRect();
      const relX = event.clientX - (rect.left + rect.width / 2);
      const relY = event.clientY - (rect.top + rect.height / 2);
      x.set(relX * 0.3);
      y.set(relY * 0.3);
    }
    onPointerMove?.(event);
  }

  function handlePointerLeave(event: React.PointerEvent<HTMLButtonElement>) {
    x.set(0);
    y.set(0);
    onPointerLeave?.(event);
  }

  return (
    <motion.button
      ref={ref}
      style={{ x, y }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.button>
  );
}
