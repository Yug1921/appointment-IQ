"use client";

import React, { useState, useEffect } from "react";
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

  // Sync main content margin when sidebar collapses/expands
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main) {
      main.style.marginLeft = isExpanded ? "224px" : "80px";
    }
  }, [isExpanded]);

  return (
    <div
      className="fixed left-0 top-0 h-full flex flex-col z-30 transition-all duration-300"
      style={{
        width: isExpanded ? 224 : 80,
        background: "#111118",
        borderRight: "1px solid #2A2A38",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{
          height: 64,
          borderBottom: "1px solid #2A2A38",
          justifyContent: isExpanded ? "space-between" : "center",
        }}
      >
        {isExpanded && (
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
              style={{ background: "#6366F1", color: "#fff" }}
            >
              A
            </div>
            <span
              className="font-semibold text-sm"
              style={{ color: "#F4F4F6", letterSpacing: "-0.01em" }}
            >
              AppointmentIQ
            </span>
          </div>
        )}
        {!isExpanded && (
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
            style={{ background: "#6366F1", color: "#fff" }}
          >
            A
          </div>
        )}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 rounded-md transition-colors"
          style={{ color: "#5A5A70" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "#1A1A24";
            (e.currentTarget as HTMLElement).style.color = "#F4F4F6";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "#5A5A70";
          }}
        >
          {isExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={!isExpanded ? item.label : undefined}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-150"
              style={{
                background: isActive ? "#6366F1" : "transparent",
                color: isActive ? "#fff" : "#9090A8",
                justifyContent: isExpanded ? "flex-start" : "center",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = "#1A1A24";
                  (e.currentTarget as HTMLElement).style.color = "#F4F4F6";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                  (e.currentTarget as HTMLElement).style.color = "#9090A8";
                }
              }}
            >
              <Icon size={17} className="shrink-0" />
              {isExpanded && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* AI Assistant Button */}
      <div className="px-2 py-3 shrink-0" style={{ borderTop: "1px solid #2A2A38" }}>
        <button
          onClick={toggleChat}
          title={!isExpanded ? "AI Assistant" : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors"
          style={{
            background: "rgba(99,102,241,0.12)",
            color: "#6366F1",
            justifyContent: isExpanded ? "flex-start" : "center",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.22)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.12)")
          }
        >
          <MessageSquare size={17} className="shrink-0" />
          {isExpanded && (
            <span className="text-sm font-medium">AI Assistant</span>
          )}
        </button>
      </div>
    </div>
  );
};