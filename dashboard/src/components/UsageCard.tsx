"use client";

import { useEffect, useState } from "react";
import { getAnalyticsStats } from "@/lib/analytics-actions";
import type { AnalyticsStats } from "@/lib/analytics-store";

function formatTimeAgo(timestamp: string | null): string {
  if (!timestamp) return "Never";
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function TopList({ items, label }: { items: { key: string; count: number }[]; label: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">{label}</p>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">No data yet</p>
      ) : (
        <ul className="space-y-1">
          {items.map(({ key, count }) => (
            <li key={key} className="flex justify-between text-sm">
              <span className="text-gray-700 dark:text-gray-300 truncate pr-2" title={key}>
                {key}
              </span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">{count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function UsageCard() {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAnalyticsStats()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load usage");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Usage</h2>
        {stats && (
          <span className="text-xs text-gray-500">
            Last event: {formatTimeAgo(stats.lastEventReceived)}
          </span>
        )}
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !stats ? (
        <p className="text-sm text-gray-400">Loading usage...</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Last 7 days</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.eventsLast7Days}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Last 30 days</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.eventsLast30Days}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <TopList items={stats.topScreens} label="Top screens" />
            <TopList items={stats.byPlatform} label="By platform" />
          </div>

          <TopList items={stats.byOperator} label="By operator" />
        </div>
      )}
    </div>
  );
}
