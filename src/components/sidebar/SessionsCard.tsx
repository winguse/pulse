import { History, Trash2 } from "lucide-react";
import type { SessionEntry } from "../../hooks/useSessions";

interface SessionsCardProps {
  sessions: SessionEntry[];
  onLoad: (id: number) => void;
  onDelete: (id: number, e: React.MouseEvent) => void;
}

export function SessionsCard({ sessions, onLoad, onDelete }: SessionsCardProps) {
  return (
    <div className="panel-card sessions-card">
      <h2 className="flex-title">
        <History className="title-icon" />
        <span>Saved Session History</span>
      </h2>

      {sessions.length === 0 ? (
        <div className="empty-history">
          No saved analyses yet. Save the current session using the "Save Session" button.
        </div>
      ) : (
        <div className="sessions-list">
          {sessions.map((sess) => (
            <div
              key={sess.id}
              className="session-item"
              onClick={() => onLoad(sess.id)}
            >
              <div className="session-info">
                <span className="session-name">{sess.name}</span>
                <span className="session-meta">
                  {sess.averageBpm ? `${sess.averageBpm} BPM` : "No beats"} •{" "}
                  {sess.duration.toFixed(1)}s • {sess.peaksCount} pulses
                </span>
              </div>
              <button
                className="session-delete-btn"
                onClick={(e) => onDelete(sess.id, e)}
                title="Delete saved session"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
