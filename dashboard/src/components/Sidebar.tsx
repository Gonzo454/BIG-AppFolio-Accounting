"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const jrwNav = [
  { href: "/jrw/dashboard", label: "Real Estate Holdings", icon: "📊" },
  { href: "/kpi-dashboard", label: "Businesses KPI's", icon: "📈" },
  { href: "/properties", label: "Properties", icon: "🏢" },
  { href: "/financials", label: "Financial Reports", icon: "💰" },
  { href: "/aged-receivables", label: "Aged Receivables", icon: "⏰" },
  { href: "/lease-expirations", label: "Lease Expirations", icon: "📅" },
  { href: "/rent-roll", label: "Rent Roll", icon: "🏠" },
  { href: "/vendors", label: "Vendors", icon: "🔧" },
  { href: "/banking", label: "Banking", icon: "🏦" },
];

const bigNav = [
  { href: "/big/dashboard", label: "Management Dashboard", icon: "deer" },
  { href: "/big/pnl", label: "P&L Statement", icon: "📋" },
  { href: "/kpi-dashboard", label: "KPI Dashboard", icon: "📈" },
];

const pvNav = [
  { href: "/pv/dashboard", label: "PV Dashboard", icon: "🏠" },
  { href: "/pv/communities", label: "Communities", icon: "🏘️" },
  { href: "/pv/financials", label: "Financial Reports", icon: "💰" },
];

const badgerRealtyNav = [
  { href: "/badger-realty", label: "Overview", icon: "🏘️" },
];

const ownerCapitalNav = [
  { href: "/loans/station-955", label: "Station 955 Loan", icon: "📝" },
];

const salesNav = [
  { href: "/prospects", label: "Prospect Dashboard", icon: "🎯" },
  { href: "/prospects/search", label: "Search Prospects", icon: "🔍" },
  { href: "/prospects/pipeline", label: "Sales Pipeline", icon: "📈" },
];

function NavSection({
  label,
  items,
  pathname,
  badge,
}: {
  label: string;
  items: { href: string; label: string; icon: string }[];
  pathname: string;
  badge?: string;
}) {
  return (
    <>
      <p className="text-xs font-semibold text-[#E07B2A] uppercase tracking-wider px-4 mb-2 flex items-center gap-2">
        {label}
        {badge && (
          <span className="text-[9px] bg-[#E07B2A]/20 text-[#E07B2A] px-1.5 py-0.5 rounded font-medium normal-case">
            {badge}
          </span>
        )}
      </p>
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/" &&
            item.href !== "/prospects" &&
            pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              active
                ? "bg-[#E07B2A] text-white"
                : "text-gray-300 hover:bg-[#E07B2A]/20 hover:text-[#E07B2A]"
            }`}
          >
            {item.icon === "deer" ? (
              <img src="/logo-white.png" alt="" className="w-5 h-7 flex-shrink-0 object-contain" />
            ) : (
              <span className="text-lg">{item.icon}</span>
            )}
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-black text-white flex flex-col z-50">
      <div className="p-4 border-b border-gray-600">
        <Link
          href="/"
          className={`flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 transition-colors ${
            pathname === "/"
              ? "bg-[#E07B2A] text-white"
              : "text-white hover:bg-[#E07B2A]/20 hover:text-[#E07B2A]"
          }`}
        >
          <img src="/command-center-icon.png" alt="" className="w-9 h-9 rounded-lg object-contain" />
          <div>
            <p className="text-lg font-semibold leading-tight">Command Center</p>
            <p className={`text-xs leading-snug ${pathname === "/" ? "text-white/70" : "text-gray-400"}`}>
              JRW Enterprises
            </p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        <NavSection label="JRW Portfolio" items={jrwNav} pathname={pathname} />

        <div className="my-4 border-t border-gray-600" />

        <NavSection label="Blackdeer I.G." items={bigNav} pathname={pathname} />

        <div className="my-4 border-t border-gray-600" />

        <NavSection label="Park Vista" items={pvNav} pathname={pathname} badge="51%" />

        <div className="my-4 border-t border-gray-600" />

        <NavSection label="Badger Realty" items={badgerRealtyNav} pathname={pathname} />

        <div className="my-4 border-t border-gray-600" />

        <NavSection label="Owner Capital" items={ownerCapitalNav} pathname={pathname} />

        <div className="my-4 border-t border-gray-600" />

        <NavSection
          label="Sales &amp; Marketing"
          items={salesNav}
          pathname={pathname}
        />
      </nav>

      <div className="p-4 border-t border-gray-800 text-xs text-gray-500 flex justify-between">
        <span>Data refreshes every 5 min</span>
        <span>v3.19.49</span>
      </div>
    </aside>
  );
}
