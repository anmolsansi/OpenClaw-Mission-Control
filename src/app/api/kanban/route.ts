import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const DATA_PATH = path.join(process.cwd(), 'data', 'kanban.json');

function ensureFile() {
  const dir = path.dirname(DATA_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(DATA_PATH)) {
    writeFileSync(DATA_PATH, JSON.stringify({ tasks: [], updatedAt: new Date().toISOString() }, null, 2));
  }
}

function readKanban() {
  ensureFile();
  const raw = readFileSync(DATA_PATH, 'utf-8');
  return JSON.parse(raw) as { tasks: Array<Record<string, unknown>>; updatedAt?: string };
}

export async function GET() {
  try {
    return NextResponse.json(readKanban());
  } catch {
    return NextResponse.json({ tasks: [], updatedAt: new Date().toISOString(), error: 'Failed to load kanban' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const taskId = String(body?.taskId || '');
    const column = String(body?.column || '');

    if (!taskId || !column) {
      return NextResponse.json({ error: 'taskId and column are required' }, { status: 400 });
    }

    const data = readKanban();
    const nextTasks = (data.tasks || []).map((t) =>
      String(t.id) === taskId ? { ...t, column } : t
    );

    const next = { tasks: nextTasks, updatedAt: new Date().toISOString() };
    writeFileSync(DATA_PATH, JSON.stringify(next, null, 2));

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update kanban' }, { status: 500 });
  }
}
