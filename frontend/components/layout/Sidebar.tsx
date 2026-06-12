"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Settings,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useChatStore } from "@/store/chatStore";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/appointments", label: "Appointments", icon: ClipboardList },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const Sidebar: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const pathname = usePathname();
  const toggleChat = useChatStore((state) => state.toggleChat);

  return (
    <div
      className={cn(
        "fixed left-0 top-0 h-full bg-bg-surface border-r border-border-DEFAULT transition-all duration-300 z-30",
        isExpanded ? "w-56" : "w-20"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-20 px-4 border-b border-border-DEFAULT">
        {isExpanded && (
          <h1 className="text-lg font-heading text-primary-DEFAULT">AiQ</h1>
        )}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 hover:bg-bg-elevated rounded-md transition-colors text-text-secondary"
        >
          {isExpanded ? (
            <ChevronLeft className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200",
                isActive
                  ? "bg-primary-DEFAULT text-white"
                  : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
              )}
              title={!isExpanded ? item.label : undefined}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {isExpanded && <span className="text-sm font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* AI Assistant Button */}
      <div className="p-2 border-t border-border-DEFAULT">
        <button
          onClick={toggleChat}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-md bg-primary-DEFAULT/20 hover:bg-primary-DEFAULT/30 text-primary-DEFAULT transition-colors",
            !isExpanded && "justify-center"
          )}
          title={!isExpanded ? "AI Assistant" : undefined}
        >
          <MessageSquare className="h-5 w-5 flex-shrink-0" />
          {isExpanded && <span className="text-sm font-medium">AI Assistant</span>}
        </button>
      </div>
    </div>
  );
};
