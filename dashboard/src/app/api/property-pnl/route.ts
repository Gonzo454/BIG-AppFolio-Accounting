import { NextRequest } from "next/server";
import { fetchReport, fetchPvReport, firstOfMonth, today, parseAmount } from "@/lib/appfolio";
import { getOwnership } from "@/lib/ownership";
import { resolveJoePvBuilding } from "@/lib/pv-buildings";
import { ENTITY_IDS_BY_NAME } from "@/lib/appfolio-entities";

type ReportFetcher = typeof fetchReport;

interface GLRow {
  account_name?: string;
  property_name?: string;
  post_date?: string;
  party_name?: string;
  debit?: string;
  credit?: string;
}

interface IncomeRow {
  account_name?: string;
  account_number?: string;
  month_to_date?: string;
  year_to_date?: string;
}

interface AccountTotalsRow {
  property_id?: number;
  property_name?: string;
}

function classifyAccount(accountNumber: string): "income" | "expense" {
  const prefix = accountNumber.charAt(0);
  if (prefix === "4" || prefix === "5") {
    // 5875/5873 are hotel labor/merchant fees, 5760 is billbacks — treat as expense
    if (accountNumber.startsWith("5875") || accountNumber.startsWith("5873") || accountNumber.startsWith("5760")) {
      return "expense";
    }
    return "income";
  }
  return "expense";
}

const DEBT_SERVICE_PREFIXES = ["8510", "8511", "8520", "8525", "8530"];

function isDebtService(acctNumber: string): boolean {
  return DEBT_SERVICE_PREFIXES.some((p) => acctNumber.startsWith(p));
}

function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

function dayBefore(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}

function extractTotals(
  rows: IncomeRow[],
  column: "month_to_date" | "year_to_date"
) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let debtService = 0;
  // 4xxx/5xxx accounts classified as expense are still inside AppFolio's
  // "Total Income" line; shift them into expenses so totals match the breakdown
  let reclassified = 0;
  const accounts: { name: string; number: string; amount: number; type: string }[] = [];

  for (const row of rows) {
    const name = (row.account_name || "").trim();
    const lowerName = name.toLowerCase();
    const amount = parseAmount(row[column]);

    if (lowerName === "total income") {
      totalIncome = amount;
      continue;
    }
    if (lowerName === "total expense" || lowerName === "total expenses") {
      totalExpenses = Math.abs(amount);
      continue;
    }
    if (lowerName === "net income" || lowerName === "net operating income") {
      continue;
    }

    if (row.account_number && amount !== 0) {
      const type = classifyAccount(row.account_number);
      if (type === "income") {
        accounts.push({ name, number: row.account_number, amount: Math.abs(amount), type });
      } else {
        const prefix = row.account_number.charAt(0);
        if (prefix === "4" || prefix === "5") {
          reclassified += amount;
        }
        // Expense: negate so positive = cost, negative = credit/billback
        accounts.push({ name, number: row.account_number, amount: -amount, type });
        if (isDebtService(row.account_number)) debtService += amount;
      }
    }
  }

  totalIncome -= reclassified;
  totalExpenses += -reclassified;

  // Debt service is a cost — AppFolio's IS column sign convention varies,
  // so normalize to a positive magnitude.
  return { totalIncome, totalExpenses, debtService: Math.abs(debtService), accounts };
}

/**
 * Fetch capital activity (3xxx accounts) from the general ledger for a specific property.
 * Capital GL entries in AppFolio live under holding-company entities, not operating
 * properties. We fetch without property filter and match by property_name.
 */
async function fetchCapitalAccounts(
  from: string,
  to: string,
  propertyName?: string,
  fetcher: ReportFetcher = fetchReport,
): Promise<{ name: string; number: string; amount: number }[]> {
  try {
    const glRows = await fetcher<GLRow>("general_ledger", {
      posted_on_from: from,
      posted_on_to: to,
    });

    const accountMap = new Map<string, { name: string; amount: number }>();

    for (const row of glRows) {

      // If a property name is provided, only include entries matching that property
      if (propertyName && row.property_name && row.property_name !== propertyName) continue;
      const acctField = (row.account_name || "").trim();
      const acctMatch = acctField.match(/^(3\d{3}-\d{4}(?:-\d{2})?)\s*-?\s*(.*)/);
      if (!acctMatch) continue;

      const acctNum = acctMatch[1].replace(/-00$/, "");
      const acctName = acctMatch[2] || acctField;
      const debit = parseFloat(row.debit || "0") || 0;
      const credit = parseFloat(row.credit || "0") || 0;
      const net = credit - debit;
      if (net === 0) continue;

      const existing = accountMap.get(acctNum);
      if (existing) {
        existing.amount += net;
      } else {
        accountMap.set(acctNum, { name: acctName, amount: net });
      }
    }

    return Array.from(accountMap.entries())
      .map(([number, { name, amount }]) => ({
        name,
        number,
        amount: Math.round(amount * 100) / 100,
      }))
      .filter((a) => a.amount !== 0)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  } catch {
    return [];
  }
}

/**
 * Locate a property across both AppFolio databases.
 *
 * account_totals omits management entities (Badger Hotel Group, Blackdeer
 * Investment Group), and Park Vista buildings live in a separate database
 * under their raw property_name rather than the label shown in the UI.
 */
async function resolveProperty(
  displayName: string,
  from: string,
  to: string,
): Promise<
  | { propertyId: number; appfolioName: string; fetcher: ReportFetcher; joePct?: number }
  | undefined
> {
  const jrwProperties = await fetchReport<AccountTotalsRow>("account_totals", {
    posted_on_from: from,
    posted_on_to: to,
  });
  const jrwMatch = jrwProperties.find((p) => p.property_name === displayName);
  if (jrwMatch?.property_id) {
    return {
      propertyId: jrwMatch.property_id,
      appfolioName: displayName,
      fetcher: fetchReport,
    };
  }

  const entityId = ENTITY_IDS_BY_NAME[displayName];
  if (entityId) {
    return { propertyId: entityId, appfolioName: displayName, fetcher: fetchReport };
  }

  const pv = resolveJoePvBuilding(displayName);
  if (pv) {
    const pvProperties = await fetchPvReport<AccountTotalsRow>("account_totals", {
      posted_on_from: from,
      posted_on_to: to,
    });
    const pvMatch = pvProperties.find((p) => p.property_name === pv.propertyName);
    if (pvMatch?.property_id) {
      return {
        propertyId: pvMatch.property_id,
        appfolioName: pv.propertyName,
        fetcher: fetchPvReport,
        joePct: pv.entry.pct,
      };
    }
  }

  return undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const propertyName = params.get("property");
  const from = params.get("from") || firstOfMonth();
  const to = params.get("to") || today();
  const period = params.get("period") || "mtd";
  const ownershipView = params.get("view") === "joe";

  if (!propertyName) {
    return Response.json({ error: "property parameter required" }, { status: 400 });
  }

  try {
    const resolved = await resolveProperty(propertyName, from, to);
    if (!resolved) {
      return Response.json(
        { error: `Property "${propertyName}" not found` },
        { status: 404 }
      );
    }
    const { fetcher, appfolioName } = resolved;
    const ownershipPct = () =>
      resolved.joePct ?? getOwnership(propertyName);

    const propertyFilter = { properties_ids: [resolved.propertyId] };
    const capitalPromise = fetchCapitalAccounts(from, to, appfolioName, fetcher);

    if (period === "ytd" || from.endsWith("-01-01")) {
      const [rows, capitalAccounts] = await Promise.all([
        fetcher<IncomeRow>("income_statement", {
          posted_on_from: from,
          posted_on_to: to,
          properties: propertyFilter,
        }),
        capitalPromise,
      ]);
      const extracted = extractTotals(rows, "year_to_date");
      const pct = ownershipView ? ownershipPct() : 1;
      return Response.json({
        propertyName,
        totalIncome: Math.round(extracted.totalIncome * pct),
        totalExpenses: Math.round(extracted.totalExpenses * pct),
        debtService: Math.round(extracted.debtService * pct),
        noi: Math.round((extracted.totalIncome - extracted.totalExpenses + extracted.debtService) * pct),
        netIncome: Math.round((extracted.totalIncome - extracted.totalExpenses) * pct),
        accounts: extracted.accounts.map((a) => ({ ...a, amount: Math.round(a.amount * pct) })),
        capitalAccounts: capitalAccounts.map((a) => ({ ...a, amount: Math.round(a.amount * pct) })),
        totalCapital: Math.round(capitalAccounts.reduce((s, a) => s + a.amount, 0) * pct),
        ownershipPct: pct,
        period: { from, to, method: "year_to_date" },
      });
    }

    if (sameMonth(from, to)) {
      const [rows, capitalAccounts] = await Promise.all([
        fetcher<IncomeRow>("income_statement", {
          posted_on_from: from,
          posted_on_to: to,
          properties: propertyFilter,
        }),
        capitalPromise,
      ]);
      const extracted = extractTotals(rows, "month_to_date");
      const pct = ownershipView ? ownershipPct() : 1;
      return Response.json({
        propertyName,
        totalIncome: Math.round(extracted.totalIncome * pct),
        totalExpenses: Math.round(extracted.totalExpenses * pct),
        debtService: Math.round(extracted.debtService * pct),
        noi: Math.round((extracted.totalIncome - extracted.totalExpenses + extracted.debtService) * pct),
        netIncome: Math.round((extracted.totalIncome - extracted.totalExpenses) * pct),
        accounts: extracted.accounts.map((a) => ({ ...a, amount: Math.round(a.amount * pct) })),
        capitalAccounts: capitalAccounts.map((a) => ({ ...a, amount: Math.round(a.amount * pct) })),
        totalCapital: Math.round(capitalAccounts.reduce((s, a) => s + a.amount, 0) * pct),
        ownershipPct: pct,
        period: { from, to, method: "month_to_date" },
      });
    }

    // Multi-month custom range — compute via year_to_date subtraction
    const beforeFrom = dayBefore(from);
    const [endRows, startRows, capitalAccounts] = await Promise.all([
      fetcher<IncomeRow>("income_statement", {
        posted_on_from: from,
        posted_on_to: to,
        properties: propertyFilter,
      }, true),
      fetcher<IncomeRow>("income_statement", {
        posted_on_from: beforeFrom.slice(0, 8) + "01",
        posted_on_to: beforeFrom,
        properties: propertyFilter,
      }, true),
      capitalPromise,
    ]);

    const endTotals = extractTotals(endRows, "year_to_date");
    const startTotals = extractTotals(startRows, "year_to_date");

    const totalIncome = endTotals.totalIncome - startTotals.totalIncome;
    const totalExpenses = endTotals.totalExpenses - startTotals.totalExpenses;
    const debtService = endTotals.debtService - startTotals.debtService;

    const startMap = new Map<string, number>();
    for (const a of startTotals.accounts) {
      startMap.set(a.number, a.amount);
    }
    const accounts = endTotals.accounts
      .map((a) => ({
        ...a,
        amount: a.amount - (startMap.get(a.number) || 0),
      }))
      .filter((a) => a.amount !== 0);

    const pct = ownershipView ? ownershipPct() : 1;
    const adjIncome = Math.round(totalIncome * pct);
    const adjExpenses = Math.round(totalExpenses * pct);

    const adjDebtService = Math.round(debtService * pct);

    return Response.json({
      propertyName,
      totalIncome: adjIncome,
      totalExpenses: adjExpenses,
      debtService: adjDebtService,
      noi: adjIncome - adjExpenses + adjDebtService,
      netIncome: adjIncome - adjExpenses,
      accounts,
      capitalAccounts: capitalAccounts.map((a) => ({ ...a, amount: Math.round(a.amount * pct) })),
      totalCapital: Math.round(capitalAccounts.reduce((s, a) => s + a.amount, 0) * pct),
      period: { from, to, method: "ytd_subtraction" },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
