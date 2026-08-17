// src/components/viz/SignalEdge.tsx
// Custom React Flow edge: a glowing gradient stroke, and — on the
// currently active edge only — a genuine traveling pulse riding the
// exact bezier path via native CSS motion-path (offset-path +
// offset-distance keyframes), not a canned "animated dashes" default.
// Falls back gracefully: browsers without offset-path support just
// don't render the travelling dot, the stroke itself still reads fine.
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "reactflow";

export default function SignalEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
}: EdgeProps<{ active?: boolean }>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const active = Boolean(data?.active);
  const gradientId = `signal-grad-${id}`;

  return (
    <>
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
          <stop offset="0%" stopColor={active ? "#00d2ff" : "rgba(255,255,255,0.08)"} />
          <stop offset="100%" stopColor={active ? "#3d81e3" : "rgba(255,255,255,0.08)"} />
        </linearGradient>
      </defs>

      {active && (
        // Soft glow pass beneath the crisp stroke — a wide, low-opacity
        // blurred duplicate of the same path reads as bloom without a
        // filter (filters on many concurrent edges get expensive fast).
        <path d={path} fill="none" stroke="#00d2ff" strokeOpacity={0.18} strokeWidth={7} />
      )}

      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: `url(#${gradientId})`,
          strokeWidth: active ? 2 : 1,
          transition: "stroke-width 0.3s ease",
        }}
      />

      {active && (
        <g style={{ offsetPath: `path("${path}")` } as React.CSSProperties}>
          <circle r={3.5} fill="#eaf8ff" className="signal-edge-pulse" />
          <circle r={7} fill="#00d2ff" fillOpacity={0.35} className="signal-edge-pulse" />
        </g>
      )}

      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
            }}
            className={`rounded-full px-2 py-0.5 text-[9px] font-mono tracking-wide transition-colors duration-300 ${
              active ? "bg-[#00d2ff]/15 text-[#eaf8ff] border border-[#00d2ff]/30" : "text-white/25"
            }`}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
