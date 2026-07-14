import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Layers, Wand2, History, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/templates", label: "Templates", icon: Layers },
  { to: "/generate", label: "Generate IDs", icon: Wand2 },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppLayout() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-[var(--color-line)] bg-white/80 backdrop-blur lg:border-b-0 lg:border-r">
        <div className="px-5 py-6">
          <div className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-[var(--color-brand)]">
            ID Formatter
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted)]">Student ID batch generator</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-4 lg:flex-col">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--color-ink)]",
                  isActive && "bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
