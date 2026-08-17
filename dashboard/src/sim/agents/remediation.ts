// src/sim/agents/remediation.ts
// Port of backend/sentinel/agents/remediation_agent.py's patch templates
// (byte-for-byte) and its 3-tier verification chain: real NemoClaw CLI
// sandbox -> the wrapper service's own mock fallback -> escalate to a
// human. The circuit breaker gating "real vs escalate" is the same
// 3-failures/60s-open breaker as the backend's; killing NemoClaw on
// /fallbacks degrades this exactly the way a real outage would.
import { CircuitBreaker } from "../circuitBreaker";
import type { ServiceHealthRegistry } from "../serviceHealth";
import type { Diagnosis, FixType, RemediationResult } from "../types";

// 1:1 with PATCH_TEMPLATES in remediation_agent.py.
const PATCH_TEMPLATES: Record<FixType, (field: string) => string> = {
  SCHEMA_MISMATCH: (f) => `Make field '${f}' optional with default null`,
  TYPE_ERROR: (f) => `Add type coercion for field '${f}'`,
  MISSING_IMPORT: (f) => `Add import statement for '${f}'`,
  TIMEOUT: () => "Increase downstream timeout and add retry with backoff",
  CONNECTION_ERROR: () => "Verify downstream service health, retry connection",
  RESOURCE_ERROR: () => "Reduce batch size / free memory before retrying",
  unknown: (f) => `Generic patch for field '${f}' (fix_type: unknown)`,
};

export function generatePatch(fixType: FixType, affectedField: string): string {
  const template = PATCH_TEMPLATES[fixType] ?? PATCH_TEMPLATES.unknown;
  return template(affectedField);
}

export class RemediationAgent {
  nemoClawBreaker = new CircuitBreaker("NemoClaw");

  private health: ServiceHealthRegistry;
  private onSandboxLine?: (kind: "stdout" | "stderr", line: string) => void;
  private onMockBanner?: () => void;

  constructor(
    health: ServiceHealthRegistry,
    onSandboxLine?: (kind: "stdout" | "stderr", line: string) => void,
    onMockBanner?: () => void
  ) {
    this.health = health;
    this.onSandboxLine = onSandboxLine;
    this.onMockBanner = onMockBanner;
  }

  async remediate(diagnosis: Diagnosis & { worker_id?: string }): Promise<RemediationResult> {
    const patch = generatePatch(diagnosis.fix_type, diagnosis.affected_field);

    if (!this.nemoClawBreaker.isClosed()) {
      return {
        verified: false,
        output: "Circuit breaker open — sandbox unavailable, escalating to human",
        sandbox_log: "",
        mode: "unavailable",
        flagged: true,
      };
    }

    this.onSandboxLine?.("stdout", `$ nemoclaw apply --patch "${patch}"`);

    if (this.health.isUp("NemoClaw")) {
      this.nemoClawBreaker.recordSuccess();
      this.onSandboxLine?.("stdout", "Running patch against synthetic fixture...");
      this.onSandboxLine?.("stdout", "Sandbox verification: PASS");
      this.onSandboxLine?.("stdout", "Patch applied successfully.");
      return {
        verified: true,
        output: `Patch verified in sandbox: ${patch}`,
        sandbox_log: "PASS",
        mode: "nemoclaw",
      };
    }

    this.nemoClawBreaker.recordFailure("NemoClaw sandbox unreachable");
    this.onSandboxLine?.("stderr", "ERROR: nemoclaw CLI unreachable, falling back to mock wrapper");
    this.onMockBanner?.();
    this.onSandboxLine?.("stdout", "[MOCK] Simulating sandbox verification...");
    this.onSandboxLine?.("stdout", "[MOCK] Patch applied successfully (simulated).");

    return {
      verified: true,
      output: `Patch applied via mock wrapper (NemoClaw unreachable): ${patch}`,
      sandbox_log: "MOCK PASS",
      mode: "mock",
      flagged: true,
    };
  }
}
