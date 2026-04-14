"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SurfaceShellProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  headerMotionSlot?: ReactNode;
  bodyMotionSlot?: ReactNode;
};

export function SurfaceShell({
  title,
  description,
  actions,
  children,
  className,
  headerMotionSlot,
  bodyMotionSlot
}: SurfaceShellProps) {
  return (
    <main className={cn("container", className)}>
      <motion.section
        className="header"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <div>
          <h1 className="cosmic-title">{title}</h1>
          <p>{description}</p>
        </div>
        {actions}
      </motion.section>

      {headerMotionSlot}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut", delay: 0.08 }}
      >
        {children}
      </motion.div>

      {bodyMotionSlot}
    </main>
  );
}
