"use client";

import { apiFetch } from "@/lib/fetchRetry";
import { LoadingState } from "@/components/LoadingState";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { DateRangePicker } from "@/components/DateRangePicker";
import { resolvePersistedRange } from "@/lib/date-range";
import { PortfolioPerformanceChart } from "@/components/PortfolioPerformanceChart";
import { PortfolioContributionDonut } from "@/components/PortfolioContributionDonut";
import { PortfolioReportsSection } from "@/components/PortfolioReportsSection";
import { UsageCard } from "@/components/UsageCard";

interface SummaryData {
  jrw: {
    totalIncome?: number;
    noi: number;
    occupancyRate: number;
    propertyCount: number;
    monthlyTrend?: number[];
  };
  big: {
    feeRevenue: number;
    totalIncome: number;
    totalExpenses: number;
    netIncome: number;
    netIncomeWithCapital?: number;
    capitalActivity?: number;
    margin: number;
    propertiesManaged: number;
    monthlyTrend?: number[];
  };
  hotel: {
    roomRevenue: number;
    totalRevenue: number;
    gop: number;
    netIncome?: number;
    monthlyTrend?: number[];
  };
  pv?: {
    totalIncome: number;
    totalExpenses: number;
    netIncome: number;
    communityCount: number;
    ownershipPct: number;
  };
  alerts: {
    leasesExpiring: number;
    agedReceivables: number;
    feeReconciliationGap: number;
  };
  period: {
    from: string;
    to: string;
    basis: string;
  };
  ownershipView?: boolean;
}

const signColor = (n: number) =>
  n < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";

const fmtK = (n: number) =>
  (n < 0 ? "-" : "") +
  "$" +
  Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });

function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const h = 32;
  const w = 100;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const color = "#22c55e";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8 mt-2" preserveAspectRatio="none">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CommandCenterPage() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ownershipView, setOwnershipView] = useState(false);

  const initialized = useRef(false);
  const skipNextToggleEffect = useRef(true);
  const dataCache = useRef<Map<string, SummaryData>>(new Map());
  const currentRange = useRef({ from: "", to: "", period: "mtd" });

  async function fetchData(from?: string, to?: string, period?: string, prefetchOnly = false) {
    const viewParam = ownershipView ? "joe" : "";
    const key = `${from || "default"}:${to || "default"}:${period || "mtd"}:${viewParam}`;
    const cached = dataCache.current.get(key);
    if (prefetchOnly && cached) return;
    if (!prefetchOnly) {
      if (cached) {
        setData(cached);
        setLoading(false);
        setRefreshing(true);
      } else {
        setLoading(true);
      }
    }
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (period) params.set("period", period);
    if (ownershipView) params.set("view", "joe");
    const qs = params.toString() ? `?${params.toString()}` : "";
    // Keep the spinner up and retry until valid data arrives
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await apiFetch(`/api/command-center${qs}`);
        if (!res.ok) throw new Error(`Command center request failed (${res.status})`);
        const d = await res.json();
        if (typeof d?.jrw?.noi !== "number" || typeof d?.big?.netIncome !== "number") {
          throw new Error("Command center data incomplete");
        }
        dataCache.current.set(key, d);
        if (!prefetchOnly) setData(d);
        break;
      } catch (err) {
        console.error("Failed to fetch command center data:", err);
        if (prefetchOnly || cached || attempt === 2) break;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    if (!prefetchOnly) {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleRangeChange(from: string, to: string, period: string) {
    currentRange.current = { from, to, period };
    fetchData(from, to, period);
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const persisted = resolvePersistedRange();
    if (persisted && persisted.period !== "mtd") {
      currentRange.current = { from: persisted.from, to: persisted.to, period: persisted.period };
      fetchData(persisted.from, persisted.to, persisted.period);
    } else {
      fetchData();
    }
    // Prefetch QTD and YTD in the background (MTD is the default load)
    const todayStr = new Date().toISOString().split("T")[0];
    const d = new Date();
    const qtdMonth = Math.floor(d.getMonth() / 3) * 3;
    const qtdFrom = `${d.getFullYear()}-${String(qtdMonth + 1).padStart(2, "0")}-01`;
    const ytdFrom = `${d.getFullYear()}-01-01`;
    setTimeout(() => {
      fetchData(qtdFrom, todayStr, "qtd", true);
      fetchData(ytdFrom, todayStr, "ytd", true);
    }, 1500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (skipNextToggleEffect.current) {
      skipNextToggleEffect.current = false;
      return;
    }
    const { from, to, period } = currentRange.current;
    dataCache.current.clear();
    if (from && to) {
      fetchData(from, to, period);
    } else {
      fetchData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownershipView]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingState />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500">Failed to load data</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Executive Overview
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Portfolio Businesses Performance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-[#E07B2A] overflow-hidden">
            <button
              onClick={() => setOwnershipView(false)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-all ${
                !ownershipView
                  ? "bg-[#E07B2A] text-white"
                  : "bg-white text-gray-500 hover:bg-[#E07B2A]/10 hover:text-[#E07B2A] dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              Portfolio View
            </button>
            <button
              onClick={() => setOwnershipView(true)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-all border-l border-gray-200 dark:border-gray-600 ${
                ownershipView
                  ? "bg-[#E07B2A] text-white"
                  : "bg-white text-gray-500 hover:bg-[#E07B2A]/10 hover:text-[#E07B2A] dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              Joe&apos;s Share
            </button>
          </div>
        </div>
      </div>
      <div className="h-0.5 w-full bg-[#E07B2A] rounded" />
      <div className="flex flex-wrap items-center justify-end gap-3">
        <DateRangePicker onRangeChange={handleRangeChange} />
      </div>
      {refreshing && (
        <div className="text-xs text-gray-400 text-right">Updating...</div>
      )}

      {/* Business Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* JRW Portfolio */}
        <Link href="/jrw/dashboard" className="block group">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-green-200 transition-all cursor-pointer h-full">
            <div className="flex items-center justify-between mb-3">
              <img src="/jrw-portfolio-brewers.png" alt="JRW Portfolio" className="h-12 w-auto object-contain" />
              <span className="text-gray-400 group-hover:text-green-600 transition-colors">→</span>
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Real Estate Holdings
            </p>
            <p className={`text-2xl font-bold mt-1 ${signColor(data.jrw.noi)}`}>
              {fmtK(data.jrw.noi)}
            </p>
            <p className="text-xs text-gray-400 mb-2">
              {ownershipView ? "Joe's Share · NOI" : "NOI"} · {data.period.basis}
              {ownershipView && <span className="ml-1 text-[#E07B2A]">(% vary by entity)</span>}
            </p>
            <ul className="list-disc list-inside text-xs text-gray-500 space-y-0.5">
              <li>{data.jrw.occupancyRate}% occupancy</li>
              <li>{data.jrw.propertyCount} properties</li>
            </ul>
            {data.jrw.monthlyTrend && (
              <Sparkline data={data.jrw.monthlyTrend} />
            )}
          </div>
        </Link>

        {/* Blackdeer Investment Group */}
        <Link href="/big/dashboard" className="block group">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-amber-200 transition-all cursor-pointer h-full">
            <div className="flex items-center justify-between mb-3">
              <img src="/big-logo.png" alt="Blackdeer Investment Group" className="h-12 w-auto object-contain dark:invert" />
              <span className="text-gray-400 group-hover:text-amber-600 transition-colors">→</span>
            </div>
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Blackdeer I.G.
            </p>
            <p className={`text-2xl font-bold mt-1 ${signColor(data.big.totalIncome)}`}>
              {fmtK(data.big.totalIncome)}
            </p>
            <p className="text-xs text-gray-400 mb-2">
              {ownershipView ? "Joe's 51% Share" : "Total Revenue"} · {data.period.basis}
            </p>
            <ul className="list-disc list-inside text-xs text-gray-500 space-y-0.5">
              <li className={signColor(data.big.margin)}>{data.big.margin}% margin</li>
              <li>{data.big.propertiesManaged} managed</li>
              <li className={signColor(data.hotel.gop)}>
                Hotel: {fmtK(data.hotel.gop)} GOP
              </li>
            </ul>
            {data.big.monthlyTrend && (
              <Sparkline data={data.big.monthlyTrend} />
            )}
          </div>
        </Link>

        {/* Park Vista Senior Housing */}
        {data.pv && (
          <Link href="/pv/dashboard" className="block group">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-purple-200 transition-all cursor-pointer h-full">
              <div className="flex items-center justify-between mb-3">
                <div className="rounded-lg bg-gray-900 dark:bg-gray-900 px-2 py-1 flex items-center justify-center">
                  <img src="/pv-logo.png" alt="Park Vista Senior Housing Management" className="h-10 w-auto object-contain" />
                </div>
                <span className="text-gray-400 group-hover:text-purple-600 transition-colors">→</span>
              </div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                Park Vista SHM
              </p>
              <p className={`text-2xl font-bold mt-1 ${signColor(data.pv.netIncome)}`}>
                {fmtK(data.pv.netIncome)}
              </p>
              <p className="text-xs text-gray-400 mb-2">
                {ownershipView ? "Joe's 51% Share · " : ""}Net Income · {data.period.basis}
              </p>
              <ul className="list-disc list-inside text-xs text-gray-500 space-y-0.5">
                <li className={signColor(data.pv.totalIncome)}>{fmtK(data.pv.totalIncome)} revenue</li>
                <li>{data.pv.communityCount} communities</li>
              </ul>
            </div>
          </Link>
        )}

      </div>

      {/* Portfolio Performance — Combined */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
          Portfolio Performance — Combined
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <PortfolioPerformanceChart joeView={ownershipView} />
          </div>
          <div>
            <PortfolioContributionDonut data={data} />
          </div>
        </div>
      </div>

      {/* Reports */}
      <PortfolioReportsSection joeView={ownershipView} />

      {/* Station 955 Loan Card */}
      <Link href="/loans/station-955" className="block group">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                <span className="text-sm">📝</span>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                  Note Receivable — Station 955
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  $1.3M @ 10% · Interest accruing · Payments start Aug 2027
                </p>
              </div>
            </div>
            <span className="text-gray-400 group-hover:text-blue-600 transition-colors">→</span>
          </div>
        </div>
      </Link>

      {/* Needs Attention Strip */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-3 flex items-center gap-2">
          <span>🔔</span> Needs Attention
        </p>
        <div className="flex flex-wrap gap-2">
          {data.alerts.leasesExpiring > 0 ? (
            <Link href="/lease-expirations">
              <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100 transition-colors cursor-pointer">
                {data.alerts.leasesExpiring} leases expiring &lt; 90d
              </span>
            </Link>
          ) : (
            <Link href="/lease-expirations">
              <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-100 transition-colors cursor-pointer">
                No leases expiring &lt; 90d
              </span>
            </Link>
          )}
          {data.alerts.agedReceivables > 0 && (
            <Link href="/aged-receivables">
              <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100 transition-colors cursor-pointer">
                {fmtK(data.alerts.agedReceivables)} aged receivables
              </span>
            </Link>
          )}
          {data.alerts.feeReconciliationGap > 1000 ? (
            <Link href="/big/dashboard">
              <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-100 transition-colors cursor-pointer">
                Internal fee recon off {fmtK(data.alerts.feeReconciliationGap)}
              </span>
            </Link>
          ) : (
            <span className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
              Fee recon balanced
            </span>
          )}

        </div>
      </div>

      {/* Usage */}
      <UsageCard />
    </div>
  );
}
