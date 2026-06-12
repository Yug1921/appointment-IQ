"use client";

import React from "react";
import { format } from "date-fns";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({ title, className }) => {
  const today = format(new Date(), "EEEE, MMMM d, yyyy");

  return (
    <div
      className={cn(
        "fixed top-0 left-56 right-0 h-20 bg-bg-surface border-b border-border-DEFAULT flex items-center justify-between px-6 z-20 transition-all duration-300",
        className
      )}
    >
      <h1 className="text-2xl font-heading text-text-primary">{title}</h1>

      <div className="flex items-center gap-6">
        <p className="text-sm text-text-secondary">{today}</p>

        <button className="p-2 hover:bg-bg-elevated rounded-md transition-colors text-text-secondary hover:text-text-primary">
          <Bell className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};
