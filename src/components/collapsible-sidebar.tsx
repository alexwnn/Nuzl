"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Box,
  ChevronLeft,
  ChevronRight,
  Gauge,
  HeartPulse,
  Home,
  Map,
  Skull,
  Swords,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navigationItems = [
  { label: "Dashboard", icon: Home, href: "/" },
  { label: "Sessions", icon: Swords, href: "/sessions" },
  { label: "Encounters", icon: Map },
  { label: "Team", icon: HeartPulse },
  { label: "PC Box", icon: Box },
  { label: "Fallen", icon: Skull },
];

export function CollapsibleSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "sticky top-16 z-40 hidden h-[calc(100vh-4rem)] border-r border-slate-200 bg-white/90 p-3 backdrop-blur dark:border-emerald-500/20 dark:bg-slate-900/80 xl:flex xl:flex-col",
        collapsed ? "w-20" : "w-72",
      )}
    >
      <div className="mb-6 flex items-center justify-between rounded-xl border border-slate-200 bg-background/90 px-3 py-3 dark:border-emerald-500/20 dark:bg-slate-950/80">
        <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20">
            <Gauge className="h-5 w-5 text-emerald-400" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-semibold text-foreground">Nuzl</p>
              <p className="text-xs text-slate-400">Soul Link HUD</p>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed((value) => !value)}
          className="relative z-[60] rounded-md border border-slate-300 p-1 text-slate-600 transition hover:bg-emerald-500/10 hover:text-emerald-700 dark:border-emerald-500/20 dark:text-slate-300 dark:hover:text-emerald-200"
          aria-label="Toggle sidebar"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className="space-y-1">
        {navigationItems.map((item) => {
          const Icon = item.icon;

          const isRouteMatch = item.href ? pathname === item.href : false;

          return item.href ? (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition dark:text-slate-300",
                "hover:bg-emerald-500/10 hover:text-emerald-200",
                isRouteMatch && "bg-emerald-500/20 text-emerald-200",
                collapsed && "justify-center",
              )}
            >
              <Icon className="h-4 w-4" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ) : (
            <button
              key={item.label}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition dark:text-slate-300",
                "hover:bg-emerald-500/10 hover:text-emerald-200",
                collapsed && "justify-center",
              )}
            >
              <Icon className="h-4 w-4" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/20 to-transparent p-3">
        <div className="mb-2 flex items-center gap-2 text-emerald-200">
          <Activity className="h-4 w-4" />
          {!collapsed && <p className="text-sm font-medium">Run Integrity</p>}
        </div>
        {!collapsed && (
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Keep pair statuses updated after every gym and rival fight.
          </p>
        )}
      </div>
    </aside>
  );
}
