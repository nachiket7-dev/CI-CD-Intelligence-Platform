import { NavLink, Outlet } from "react-router-dom";

import { cn } from "@/lib/cn";
import { useHealth } from "@/lib/hooks";
import { SyntheticBanner } from "../domain/SyntheticBanner";

const NAV = [
  { to: "/", label: "Runs", end: true },
  { to: "/models", label: "Models" },
  { to: "/tracker", label: "Tracker" },
];

/** A new shell is a top bar. A sidebar is earned by more than about seven destinations. */
export function AppShell() {
  const health = useHealth();
  const nav = import.meta.env.DEV ? [...NAV, { to: "/design", label: "Design system" }] : NAV;
  return (
    <>
      <header className="sticky top-0 z-(--z-sticky-nav) border-b border-rule bg-paper">
        <div className="container flex h-14 items-center gap-6">
          <NavLink to="/" aria-label="CI/CD Intelligence, home" className="font-display text-title font-medium text-ink no-underline">
            CI/CD Intelligence
          </NavLink>
          <nav aria-label="Main" className="-mx-2 flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "inline-flex h-9 items-center rounded-pill px-3 text-sm font-medium whitespace-nowrap no-underline transition-colors duration-(--dur-micro) pointer-coarse:h-11",
                    isActive ? "bg-paper-3 text-ink" : "text-ink-2 hover:bg-paper-3 hover:text-ink",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <p className="hidden text-sm text-muted sm:block">
            {health.data ? (health.data.active_model ? `Active model ${health.data.active_model}` : "No active model") : ""}
          </p>
        </div>
      </header>
      <SyntheticBanner />
      <main className="container py-8">
        <Outlet />
      </main>
    </>
  );
}
