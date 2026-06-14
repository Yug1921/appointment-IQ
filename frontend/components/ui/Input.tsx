// Input.tsx
"use client";

import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: LucideIcon;
  className?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon: Icon, className, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-text-primary mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-text-secondary pointer-events-none" />
          )}
          <input
            ref={ref}
            className={cn(
              "w-full bg-bg-surface border border-border-DEFAULT text-text-primary placeholder:text-text-muted rounded-input px-3 py-2 transition-all duration-200",
              Icon && "pl-10",
              "focus:border-primary-DEFAULT focus:ring-2 focus:ring-primary-glow",
              error &&
                "border-danger focus:border-danger focus:ring-red-500/15",
              className
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1 text-xs text-danger">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
