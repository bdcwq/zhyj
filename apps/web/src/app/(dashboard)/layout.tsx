"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { STAFF_ROLES } from "@zhyj/shared";
import StoreSwitcher from "@/components/store-switcher";

const businessItems = [
  { href: "/monitoring", label: "体质监测" },
  { href: "/appointments", label: "预约管理" },
  { href: "/verification", label: "核销管理" },
  { href: "/robot-sessions", label: "机器人管理" },
];

const managementItems = [
  { href: "/statistics", label: "数据统计" },
  { href: "/staff", label: "员工管理" },
  { href: "/rooms", label: "房间管理" },
  { href: "/devices", label: "设备管理" },
  { href: "/residents-management", label: "居民管理" },
  { href: "/stores", label: "店铺管理" },
  { href: "/schedules", label: "排班管理" },
  { href: "/attendance", label: "考勤管理" },
  { href: "/leaves", label: "请假管理" },
  { href: "/cross-store-report", label: "跨店报表" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  const role = user?.role;
  const showManagement =
    role === STAFF_ROLES.ADMIN || role === STAFF_ROLES.STORE_MANAGER;

  const visibleItems = loading
    ? []
    : [...businessItems, ...(showManagement ? managementItems : [])];

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="font-semibold text-lg">社区健康管理系统</h1>
          <StoreSwitcher />
          <nav className="flex items-center gap-6">
            {loading ? (
              // Skeleton placeholders while fetching auth
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className="h-4 w-16 bg-gray-200 rounded animate-pulse"
                />
              ))
            ) : (
              visibleItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm ${
                    pathname === item.href
                      ? "text-blue-600 font-medium"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {item.label}
                </Link>
              ))
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              退出
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
