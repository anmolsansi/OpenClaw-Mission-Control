import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import {
  getDatabase,
  getCostSummary,
  getCostByAgent,
  getCostByModel,
  getDailyCost,
  getHourlyCost,
} from "@/lib/usage-queries";
import path from "path";
import { execSync } from "child_process";
import { calculateCost, normalizeModelId } from "@/lib/pricing";

const DB_PATH = path.join(process.cwd(), "data", "usage-tracking.db");
const DEFAULT_BUDGET = 100.0; // Default budget in USD


function sameUtcDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

function toMMDD(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function buildLiveCostsFromStatus(status: any, days: number) {
  const recent: any[] = status?.sessions?.recent || [];
  const now = new Date();
  const y = new Date(now);
  y.setUTCDate(y.getUTCDate() - 1);

  const byAgentMap = new Map<string, { agent: string; cost: number; tokens: number }>();
  const byModelMap = new Map<string, { model: string; cost: number; tokens: number }>();
  const dailyMap = new Map<string, { date: string; cost: number; input: number; output: number }>();
  const hourlyMap = new Map<string, { hour: string; cost: number }>();

  let today = 0, yesterday = 0, thisMonth = 0, lastMonth = 0;

  for (const r of recent) {
    const updated = new Date(Number(r.updatedAt || Date.now()));
    const modelNorm = normalizeModelId(String(r.model || "unknown"));
    const input = Number(r.inputTokens || 0);
    const output = Number(r.outputTokens || 0);
    const total = Number(r.totalTokens || 0);
    const cost = calculateCost(modelNorm, input, output);

    const agent = String(r.agentId || (String(r.key || '').split(':')[1] || 'main'));
    const modelLabel = modelNorm.includes('/') ? modelNorm.split('/').slice(1).join('/') : modelNorm;

    const a = byAgentMap.get(agent) || { agent, cost: 0, tokens: 0 };
    a.cost += cost; a.tokens += total; byAgentMap.set(agent, a);

    const m = byModelMap.get(modelLabel) || { model: modelLabel, cost: 0, tokens: 0 };
    m.cost += cost; m.tokens += total; byModelMap.set(modelLabel, m);

    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - days + 1);
    if (updated >= cutoff) {
      const dkey = toMMDD(updated);
      const d = dailyMap.get(dkey) || { date: dkey, cost: 0, input: 0, output: 0 };
      d.cost += cost; d.input += input; d.output += output; dailyMap.set(dkey, d);
    }

    const hCutoff = Date.now() - 24 * 60 * 60 * 1000;
    if (updated.getTime() >= hCutoff) {
      const h = `${String(updated.getUTCHours()).padStart(2, '0')}:00`;
      const hr = hourlyMap.get(h) || { hour: h, cost: 0 };
      hr.cost += cost; hourlyMap.set(h, hr);
    }

    if (sameUtcDay(updated, now)) today += cost;
    if (sameUtcDay(updated, y)) yesterday += cost;
    if (updated.getUTCFullYear() === now.getUTCFullYear() && updated.getUTCMonth() === now.getUTCMonth()) thisMonth += cost;
    const lm = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    if (updated.getUTCFullYear() === lm.getUTCFullYear() && updated.getUTCMonth() === lm.getUTCMonth()) lastMonth += cost;
  }

  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const daysElapsed = now.getUTCDate();
  const projected = daysElapsed > 0 ? (thisMonth / daysElapsed) * daysInMonth : thisMonth;

  const byAgent = Array.from(byAgentMap.values()).sort((a,b)=>b.cost-a.cost);
  const byModel = Array.from(byModelMap.values()).sort((a,b)=>b.cost-a.cost);
  const daily = Array.from(dailyMap.values()).sort((a,b)=>a.date.localeCompare(b.date)).map(d=>({ ...d, cost: Number(d.cost.toFixed(4)) }));
  const hourly = Array.from(hourlyMap.values()).sort((a,b)=>a.hour.localeCompare(b.hour)).map(h=>({ ...h, cost: Number(h.cost.toFixed(4)) }));

  return { today, yesterday, thisMonth, lastMonth, projected, byAgent, byModel, daily, hourly };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const timeframe = searchParams.get("timeframe") || "30d";

  // Parse timeframe to days
  const days = parseInt(timeframe.replace(/\D/g, ""), 10) || 30;

  try {
    const db = getDatabase(DB_PATH);

    if (db) {
      const summary = getCostSummary(db);
      const byAgent = getCostByAgent(db, days);
      const byModel = getCostByModel(db, days);
      const daily = getDailyCost(db, days);
      const hourly = getHourlyCost(db);
      db.close();

      const hasData = summary.thisMonth > 0 || byAgent.length > 0 || byModel.length > 0 || daily.length > 0;
      if (hasData) {
        return NextResponse.json({ ...summary, budget: DEFAULT_BUDGET, byAgent, byModel, daily, hourly });
      }
    }

    // Fallback: derive live costs directly from current OpenClaw status
    const raw = execSync('openclaw status --json 2>/dev/null', { encoding: 'utf-8', timeout: 10000 });
    const status = JSON.parse(raw);
    const live = buildLiveCostsFromStatus(status, days);

    return NextResponse.json({
      today: Number(live.today.toFixed(4)),
      yesterday: Number(live.yesterday.toFixed(4)),
      thisMonth: Number(live.thisMonth.toFixed(4)),
      lastMonth: Number(live.lastMonth.toFixed(4)),
      projected: Number(live.projected.toFixed(4)),
      budget: DEFAULT_BUDGET,
      byAgent: live.byAgent,
      byModel: live.byModel,
      daily: live.daily,
      hourly: live.hourly,
      source: 'live-status',
    });
  } catch (error) {
    console.error("Error fetching cost data:", error);
    return NextResponse.json(
      { error: "Failed to fetch cost data" },
      { status: 500 }
    );
  }
}

// POST endpoint to update budget
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { budget, alerts } = body;

    // In production, save to database
    // For now, just return success
    
    return NextResponse.json({
      success: true,
      budget,
      alerts,
    });
  } catch (error) {
    console.error("Error updating budget:", error);
    return NextResponse.json(
      { error: "Failed to update budget" },
      { status: 500 }
    );
  }
}
