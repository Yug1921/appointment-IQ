"use client";

import React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "confirmed" | "pending" | "cancelled" | "completed";

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  confirmed: "bg-green-500/20 text-success",
  pending: "bg-warning/20 text-warning",
  cancelled: "bg-danger/20 text-danger",
  completed: "bg-accent/20 text-accent",
};

const dotColors: Record<BadgeVariant, string> = {
  confirmed: "bg-success",
  pending: "bg-warning",
  cancelled: "bg-danger",
  completed: "bg-accent",
};

export const Badge: React.FC<BadgeProps> = ({
  variant,
  children,
  className,
}) => {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        variantStyles[variant],
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotColors[variant])} />
      {children}
    </span>
  );
};
