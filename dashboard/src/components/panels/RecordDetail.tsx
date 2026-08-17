// src/components/panels/RecordDetail.tsx
// Right pane's "selected" state — replaces the live topology entirely
// when an audit record is clicked, exactly like clicking a message in a
// mail client swaps the reading pane. Every field shown comes straight
// off the real AuditRecord; nothing here is invented for a specific
// record, though the layout itself is deliberately styled after the
// canonical "Field 'Tax_ID' not found" diagnosis case.
import { Reply, RotateCw, Archive as ArchiveIcon, Sparkles, ShieldCheck, AlertTriangle, Wrench } from "lucide-react";
import { generatePatch } from "../../sim/agents/remediation";
import { useDataSource } from "../../app/dataSourceContext";
import type { AuditRecord } from "../../sim/types";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// A short, deterministic ticket-style id derived from the record's own
// hash — not random, and stable for the same record every time.
function ticketId(hash: string): string {
  return `#${(parseInt(hash.slice(0, 4), 16) % 900) + 100}`;
}

function statusLine(r: AuditRecord): { icon: typeof ShieldCheck; text: string; tone: string } {
  if (r.to_state === "RESUMED") return { icon: ShieldCheck, text: "Sandbox verified · worker resumed", tone: "text-state-healthy" };
  if (r.to_state === "ESCALATED") return { icon: AlertTriangle, text: "Escalated to a human — confidence below threshold", tone: "text-state-escalated" };
  if (r.to_state === "REMEDIATING") return { icon: Wrench, text: "Patch generated — verifying in sandbox", tone: "text-state-remediating" };
  return { icon: Sparkles, text: `${r.worker_id} → ${r.to_state}`, tone: "text-white/60" };
}

interface RecordDetailProps {
  record: AuditRecord;
  onClose: () => void;
}

export default function RecordDetail({ record, onClose }: RecordDetailProps) {
  const { source } = useDataSource();
  const status = statusLine(record);
  const StatusIcon = status.icon;
  const hasConfidence = typeof record.confidence_score === "number";
  const confidencePct = hasConfidence ? Math.round(record.confidence_score! * 100) : null;
  const confidenceTone = !hasConfidence ? "text-white/40" : confidencePct! >= 80 ? "text-state-healthy" : confidencePct! >= 60 ? "text-state-suspected" : "text-state-escalated";
  const isResolved = record.to_state === "RESUMED" || record.to_state === "ESCALATED";

  const title = record.root_cause ?? `${record.agent_name} · ${record.trigger_event}`;
  const patch = record.fix_type && record.affected_field ? generatePatch(record.fix_type as never, record.affected_field) : null;

  const rerun = () => {
    source.injectFault(record.worker_id, "schema_corruption", { field: record.affected_field ?? "Tax_ID" });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 px-3 py-2.5 border-b border-white/10 shrink-0">
        <button
          disabled={isResolved}
          title={isResolved ? "This incident already resolved — escalation isn't retroactive" : "Escalate to a human"}
          className="flex items-center gap-1.5 text-[11px] text-white/50 px-2 py-1.5 rounded-md hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
        >
          <AlertTriangle size={12} strokeWidth={1.5} />
          Escalate
        </button>
        <button
          onClick={rerun}
          title="Inject a similar fault on this worker"
          className="flex items-center gap-1.5 text-[11px] text-white/50 px-2 py-1.5 rounded-md hover:bg-white/5"
        >
          <RotateCw size={12} strokeWidth={1.5} />
          Re-run
        </button>
        <button
          onClick={onClose}
          title="Back to live topology"
          className="flex items-center gap-1.5 text-[11px] text-white/50 px-2 py-1.5 rounded-md hover:bg-white/5"
        >
          <ArchiveIcon size={12} strokeWidth={1.5} />
          Archive
        </button>
        <span className="ml-auto text-[11px] text-white/25 font-mono">{ticketId(record.current_hash)}</span>
      </div>

      <div className="px-5 py-5 overflow-y-auto flex-1 min-h-0">
        <h3 className="text-[15px] font-semibold text-white leading-snug">{title}</h3>

        <div className="flex items-center gap-2.5 mt-3.5">
          <div className="w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold text-white bg-gradient-to-br from-[#00d2ff] to-[#0B2551] shrink-0">
            {record.agent_name[0]}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-white">{record.agent_name}</p>
            <p className="text-[10px] text-white/40">{record.worker_id} · {formatTime(record.timestamp)}</p>
          </div>
          {record.fix_type && (
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-white/60 shrink-0">
              {record.fix_type}
            </span>
          )}
        </div>

        {record.root_cause && (
          <div className="liquid-glass rounded-lg p-3 mt-4">
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} style={{ color: "#A4F4FD" }} />
              <span className="text-[11px] font-semibold text-white">Diagnosis</span>
            </div>
            <p className="text-[11px] text-white/65 leading-relaxed mt-1.5">{record.root_cause}</p>
          </div>
        )}

        {hasConfidence && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[10px] text-white/40 mb-1">
              <span className="uppercase tracking-wider">Confidence</span>
              <span className={`font-semibold ${confidenceTone}`}>{confidencePct}%</span>
            </div>
            <div className="h-1 rounded-full bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full ${confidenceTone.replace("text-", "bg-")}`} style={{ width: `${confidencePct}%` }} />
            </div>
            <p className="text-[11px] text-white/45 leading-relaxed mt-2.5">
              {confidencePct! >= 70
                ? "Confidence cleared the 0.7 threshold — remediation attempted automatically, no human escalation."
                : "Confidence fell below the 0.7 threshold — escalated rather than guessing at a fix."}
            </p>
          </div>
        )}

        {patch && (
          <div className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-white/60 px-2.5 py-1.5 rounded-md border border-white/10 bg-white/[0.03]">
            <Wrench size={11} strokeWidth={1.5} />
            {patch}
          </div>
        )}

        <div className={`mt-4 flex items-center gap-1.5 text-[11px] ${status.tone}`}>
          <StatusIcon size={12} strokeWidth={1.5} />
          {status.text}
        </div>

        <div className="mt-6 pt-4 border-t border-white/[0.06] text-[10px] font-mono text-white/25 space-y-1">
          <div className="flex items-center gap-1.5">
            <Reply size={10} strokeWidth={1.5} />
            hash chain
          </div>
          <p className="truncate">prev {record.previous_hash.slice(0, 24)}…</p>
          <p className="truncate">curr {record.current_hash.slice(0, 24)}…</p>
        </div>
      </div>
    </div>
  );
}
