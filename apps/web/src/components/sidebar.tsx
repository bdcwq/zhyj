"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { STAFF_ROLES } from "@zhyj/shared";
import StoreSwitcher from "@/components/store-switcher";
import { cn } from "@/lib/utils";
import {
  Activity,
  Calendar,
  ClipboardCheck,
  Bot,
  BarChart3,
  Users,
  DoorOpen,
  Cpu,
  UserCircle,
  Store,
  Clock,
  CalendarDays,
  FileText,
  ArrowLeftRight,
  PartyPopper,
  LayoutDashboard,
  LogOut,
  X,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Navigation data                                                    */
/* ------------------------------------------------------------------ */

const businessItems = [
  { href: "/monitoring", label: "体质监测", icon: Activity },
  { href: "/appointments", label: "预约管理", icon: Calendar },
  { href: "/verification", label: "核销管理", icon: ClipboardCheck },
  { href: "/robot-sessions", label: "机器人管理", icon: Bot },
];

const managementItems = [
  { href: "/statistics", label: "数据统计", icon: BarChart3 },
  { href: "/staff", label: "员工管理", icon: Users },
  { href: "/rooms", label: "房间管理", icon: DoorOpen },
  { href: "/devices", label: "设备管理", icon: Cpu },
  { href: "/residents-management", label: "居民管理", icon: UserCircle },
  { href: "/stores", label: "店铺管理", icon: Store },
  { href: "/schedules", label: "排班管理", icon: Clock },
  { href: "/attendance", label: "考勤管理", icon: CalendarDays },
  { href: "/leaves", label: "请假管理", icon: FileText },
  { href: "/cross-store-report", label: "跨店报表", icon: ArrowLeftRight },
  { href: "/activities", label: "活动管理", icon: PartyPopper },
];

/* ------------------------------------------------------------------ */
/*  Sidebar component                                                  */
/* ------------------------------------------------------------------ */

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  const role = user?.role;
  const showManagement =
    role === STAFF_ROLES.ADMIN || role === STAFF_ROLES.STORE_MANAGER;

  async function handleLogout() {
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Even if logout endpoint fails, redirect anyway
      // (cookie may already be expired)
    }
    router.push("/login");
  }

  function handleNavClick() {
    onClose?.();
  }

  return (
    <>
      {/* ── Tablet backdrop overlay ── */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 lg:hidden",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-50 flex group",
          "transition-transform duration-200 ease-out",
          "lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        aria-label="主导航"
      >
        {/* ── Narrow icon rail ── */}
        <div className="w-16 bg-apple-sidebar flex flex-col items-center shrink-0">
          {/* Brand mark */}
          <Link
            href="/monitoring"
            onClick={handleNavClick}
            className="flex flex-col items-center justify-center w-full h-16 text-apple-sidebar-foreground/90 hover:text-apple-sidebar-foreground transition-colors"
          >
            <LayoutDashboard className="w-6 h-6 mb-0.5" strokeWidth={1.5} />
            <span className="text-[9px] font-medium tracking-wider opacity-60">
              精卫识仪
            </span>
          </Link>

          {/* Close button — tablet only */}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors lg:hidden"
            aria-label="关闭菜单"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>

          <div className="w-8 h-px bg-white/10 mb-2" />

        {/* Navigation icons */}
        <nav className="flex-1 flex flex-col items-center gap-0.5 w-full px-1.5 overflow-y-auto">
          {loading ? (
            // Skeleton placeholders while auth loads
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={`skel-biz-${i}`}
                className="w-10 h-10 rounded-lg bg-white/5 animate-pulse"
              />
            ))
          ) : (
            businessItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick}
                  title={item.label}
                  className={`relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150 ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-white/50 hover:text-white/90 hover:bg-white/5"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-full" />
                  )}
                  <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
                </Link>
              );
            })
          )}

          {/* Management section — icons only */}
          {showManagement && (
            <>
              <div className="w-8 h-px bg-white/10 my-2" />
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={`skel-mgmt-${i}`}
                      className="w-10 h-10 rounded-lg bg-white/5 animate-pulse"
                    />
                  ))
                : managementItems.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={handleNavClick}
                        title={item.label}
                        className={`relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-150 ${
                          active
                            ? "bg-primary/15 text-primary"
                            : "text-white/50 hover:text-white/90 hover:bg-white/5"
                        }`}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-full" />
                        )}
                        <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
                      </Link>
                    );
                  })}
            </>
          )}
        </nav>

        {/* Bottom: user avatar placeholder + logout */}
        <div className="flex flex-col items-center gap-1 pb-4">
          <button
            type="button"
            onClick={handleLogout}
            title="退出登录"
            className="flex items-center justify-center w-10 h-10 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition-all duration-150"
          >
            <LogOut className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* ── Expanded flyout panel ── */}
      <div
        className={cn(
          "w-60 bg-apple-sidebar border-l border-white/[0.06]",
          "flex flex-col overflow-hidden shrink-0",
          /* Desktop (lg+): absolute positioning with hover-expand */
          "lg:absolute lg:left-16 lg:top-0 lg:bottom-0",
          "lg:opacity-0 lg:group-hover:opacity-100",
          "lg:-translate-x-2 lg:group-hover:translate-x-0",
          "lg:transition-all lg:duration-200 lg:ease-out",
          "lg:pointer-events-none lg:group-hover:pointer-events-auto"
        )}
      >
        {/* Brand header */}
        <Link
          href="/monitoring"
          onClick={handleNavClick}
          className="flex items-center gap-3 px-5 h-16 text-apple-sidebar-foreground hover:bg-white/5 transition-colors"
        >
          <LayoutDashboard className="w-5 h-5 text-primary" strokeWidth={1.5} />
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-wide">
              精卫识仪
            </span>
            <span className="text-[10px] text-white/40 tracking-wider">
              社区健康管理
            </span>
          </div>
        </Link>

        <div className="h-px bg-white/[0.06] mx-4" />

        {/* Navigation links */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {/* Business section */}
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">
            业务
          </p>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={`panel-skel-biz-${i}`}
                  className="h-8 rounded-md bg-white/5 animate-pulse mb-1"
                />
              ))
            : businessItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleNavClick}
                    className={`relative flex items-center gap-3 px-3 py-1.5 rounded-md text-[13px] transition-all duration-150 ${
                      active
                        ? "bg-primary/15 text-white font-medium"
                        : "text-white/55 hover:text-white/90 hover:bg-white/5"
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-primary rounded-full" />
                    )}
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}

          {/* Management section */}
          {showManagement && (
            <>
              <div className="h-px bg-white/[0.06] my-3 mx-1" />
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">
                管理
              </p>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={`panel-skel-mgmt-${i}`}
                      className="h-8 rounded-md bg-white/5 animate-pulse mb-1"
                    />
                  ))
                : managementItems.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={handleNavClick}
                        className={`relative flex items-center gap-3 px-3 py-1.5 rounded-md text-[13px] transition-all duration-150 ${
                          active
                            ? "bg-primary/15 text-white font-medium"
                            : "text-white/55 hover:text-white/90 hover:bg-white/5"
                        }`}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-primary rounded-full" />
                        )}
                        <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
            </>
          )}
        </nav>

        {/* Bottom: store switcher + user info + logout */}
        <div className="border-t border-white/[0.06] px-4 py-3 space-y-2">
          <StoreSwitcher dark />
          {user && (
            <div className="flex items-center gap-2 px-1">
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-xs font-medium shrink-0">
                {user.name?.charAt(0) ?? "?"}
              </div>
              <span className="text-xs text-white/60 truncate">
                {user.name}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 w-full rounded-md text-xs text-white/40 hover:text-white/80 hover:bg-white/5 transition-all duration-150"
          >
            <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>退出登录</span>
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
