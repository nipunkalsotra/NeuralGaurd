// src/components/panels/LiveFeedPanel.tsx
// The "essential, always-visible" half of the Control Plane: circuit
// breaker status + the audit stream, stacked as one unit. Rendered
// persistently alongside the topology on wide screens, and reused as-is
// inside the InspectorDrawer as a fallback on narrow ones where there
// isn't room for a permanent sidebar.
import LiveStatusStrip from "./LiveStatusStrip";
import AuditLogPanel from "./AuditLogPanel";

export default function LiveFeedPanel() {
  return (
    <div className="flex h-full flex-col">
      <LiveStatusStrip />
      <div className="min-h-0 flex-1">
        <AuditLogPanel />
      </div>
    </div>
  );
}
