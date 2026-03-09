"use client";

import { useEffect, useMemo, useState } from "react";

type Task = {
  id: string;
  title: string;
  column: string;
  createdAt?: string;
  assignees?: string[];
  details?: string;
  owner?: string;
  priority?: "low" | "medium" | "high";
  kind?: "feature" | "approval" | "ops" | "recurring";
};

const COLUMNS = ["Todo", "In Progress", "Review", "Done", "Recurring"];
const ME = "Anmol";

function normalizeTask(task: Task): Task {
  const assignees = Array.isArray(task.assignees) ? task.assignees : [];

  // Backward-compatible inferred assignee/details for old cards
  const inferredAssignees = assignees.length
    ? assignees
    : task.id.includes("SHIP") || /approval|review|confirm/i.test(task.title)
      ? [ME, "Neutron"]
      : ["Neutron"];

  const recurring = /cron|recurr|daily|weekly|monthly|heartbeat/i.test(`${task.title} ${task.id}`);

  return {
    ...task,
    assignees: inferredAssignees,
    column: recurring ? "Recurring" : (COLUMNS.includes(task.column) ? task.column : "Todo"),
    details:
      task.details ||
      `Task ${task.id}\n\n${task.title}\n\nAssigned: ${inferredAssignees.join(", ")}\nPriority: ${task.priority || "medium"}`,
  };
}

export default function KanbanPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showMineOnly, setShowMineOnly] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/kanban")
      .then((r) => r.json())
      .then((d) => setTasks((d.tasks || []).map(normalizeTask)))
      .catch(() => setTasks([]));
  }, []);

  const visibleTasks = useMemo(() => {
    if (!showMineOnly) return tasks;
    return tasks.filter((t) => (t.assignees || []).some((a) => a.toLowerCase() === ME.toLowerCase()));
  }, [tasks, showMineOnly]);

  const grouped = useMemo(() => {
    const map: Record<string, Task[]> = Object.fromEntries(COLUMNS.map((c) => [c, []]));
    for (const t of visibleTasks) {
      map[t.column].push(t);
    }
    return map;
  }, [visibleTasks]);

  const myTaskCount = tasks.filter((t) => (t.assignees || []).some((a) => a.toLowerCase() === ME.toLowerCase())).length;

  const moveTask = (taskId: string, toColumn: string) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, column: toColumn } : t)));

    // best-effort persistence
    fetch('/api/kanban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, column: toColumn }),
    }).catch(() => {});
  };

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1
            className="text-3xl font-bold mb-2"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}
          >
            Kanban Board
          </h1>
          <p style={{ color: "var(--text-secondary)" }}>
            Live board from <code>data/kanban.json</code> • Drag cards between columns
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
            My tasks: <strong style={{ color: "var(--text-primary)" }}>{myTaskCount}</strong>
          </div>
          <button
            onClick={() => setShowMineOnly((v) => !v)}
            className="px-3 py-2 rounded-lg text-sm font-medium"
            style={{
              background: showMineOnly ? "var(--accent)" : "var(--card-elevated)",
              color: showMineOnly ? "white" : "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            {showMineOnly ? "Showing: My Tasks" : "Show My Tasks"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {COLUMNS.map((col) => (
          <div
            key={col}
            className="rounded-xl p-3"
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              outline: draggingId ? "2px dashed var(--accent)" : "none",
              outlineOffset: "-4px",
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const taskId = e.dataTransfer.getData("text/task-id");
              if (taskId) moveTask(taskId, col);
              setDraggingId(null);
            }}
          >
            <div className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
              {col} ({grouped[col].length})
            </div>
            <div className="space-y-2">
              {grouped[col].map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/task-id", t.id);
                    setDraggingId(t.id);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  className="rounded-lg p-3"
                  style={{
                    background: "var(--card-elevated)",
                    border: "1px solid var(--border)",
                    cursor: "grab",
                    opacity: draggingId === t.id ? 0.6 : 1,
                  }}
                >
                  <div className="text-xs mb-1" style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
                    {t.id}
                  </div>
                  <div className="text-sm mb-2" style={{ color: "var(--text-primary)" }}>
                    {t.title}
                  </div>

                  <div className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
                    Assigned: {(t.assignees || []).join(", ")}
                  </div>

                  <button
                    onClick={() => setSelectedTask(t)}
                    className="w-full px-2 py-1.5 rounded-md text-xs font-medium"
                    style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--border)" }}
                  >
                    Explain task
                  </button>
                </div>
              ))}
              {grouped[col].length === 0 && (
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                  No cards
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedTask && (
        <div
          onClick={() => setSelectedTask(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 60 }}
          className="flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-xl p-5 max-w-2xl w-full"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          >
            <div className="text-xs mb-1" style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
              {selectedTask.id}
            </div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
              {selectedTask.title}
            </h2>
            <div className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              Column: {selectedTask.column} • Assigned: {(selectedTask.assignees || []).join(", ")}
            </div>
            <pre
              className="whitespace-pre-wrap text-sm rounded-lg p-3"
              style={{ background: "var(--card-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            >
              {selectedTask.details}
            </pre>
            <button
              onClick={() => setSelectedTask(null)}
              className="mt-4 px-3 py-2 rounded-lg text-sm font-medium"
              style={{ background: "var(--accent)", color: "white" }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
