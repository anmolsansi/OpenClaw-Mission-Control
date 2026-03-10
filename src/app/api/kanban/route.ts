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

function writeKanban(tasks: Array<Record<string, unknown>>) {
  const next = { tasks, updatedAt: new Date().toISOString() };
  writeFileSync(DATA_PATH, JSON.stringify(next, null, 2));
}

function makeTaskId() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
  return `TASK-${stamp}`;
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
    const data = readKanban();

    if (body?.action === 'create') {
      const title = String(body?.title || '').trim();
      if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

      const task = {
        id: String(body?.id || makeTaskId()),
        title,
        column: String(body?.column || 'Todo'),
        assignees: Array.isArray(body?.assignees) ? body.assignees : [],
        priority: ['low', 'medium', 'high'].includes(String(body?.priority)) ? body.priority : 'medium',
        details: String(body?.details || ''),
        createdAt: new Date().toISOString(),
      };

      const nextTasks = [task, ...(data.tasks || [])];
      writeKanban(nextTasks);
      return NextResponse.json({ success: true, task });
    }

    const taskId = String(body?.taskId || '');
    const column = String(body?.column || '');

    if (!taskId || !column) {
      return NextResponse.json({ error: 'taskId and column are required' }, { status: 400 });
    }

    const nextTasks = (data.tasks || []).map((t) =>
      String(t.id) === taskId ? { ...t, column } : t,
    );

    writeKanban(nextTasks);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update kanban' }, { status: 500 });
  }
}
