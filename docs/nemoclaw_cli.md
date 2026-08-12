# NemoClaw CLI Reference

Documentation of real `nemoclaw` CLI output, captured from an actual sandbox
(`ai-factory-sentinel`). Day 1 section covers baseline command output. Day 3
section covers the parsing strategy the real wrapper adapter (Days 8-9) will
use, backed by real-tested failure scenarios.

- CLI version: `nemoclaw` (host binary)
- OpenShell: `0.0.85` (docker driver)
- Sandbox agent: OpenClaw v2026.6.10
- Model: `nvidia/nemotron-3-super-120b-a12b` (provider: `nvidia-prod`)

---

## `nemoclaw <name> connect`

Opens an interactive shell inside the sandbox.

### stdout
```
✓ Active gateway set to 'nemoclaw'

  ✓ Connecting to sandbox 'ai-factory-sentinel'
  Inside the sandbox, run `openclaw tui` to start chatting with the agent.
  Type `/exit` to leave the chat, then `exit` to return to the host shell.

  Note: this sandbox restricts outbound network access by policy.
  Blocked requests fail with 'CONNECT tunnel failed, response 403'.
  See which rule denied a request:  nemoclaw <name> logs --tail 50
sandbox@603607c1c702:~$
```
Session then drops into an interactive prompt (`sandbox@<container-id>:~$`)
until you run `exit`.

### stderr
None observed. All output above is stdout.

### exit code
`0` (after typing `exit` inside the sandbox shell to return to host)

### Notable behaviors
- Prints the container-scoped shell prompt (`sandbox@<container-id>`) — the
  container ID is dynamic per sandbox instance/rebuild, not stable.
- Warns up front that outbound network is policy-restricted. Any blocked
  outbound call inside the sandbox fails with:
  ```
  CONNECT tunnel failed, response 403
  ```
- Points to `nemoclaw <name> logs --tail 50` to identify which policy rule
  denied a given request.
- **Gotcha (confirmed Day 3):** `nemoclaw` is a **host-side** binary — it is
  NOT available inside an active `sandbox@<container-id>:~$` shell session.
  Must `exit` back to the host shell before running further
  `nemoclaw <name> exec` commands from the host.

---

## `nemoclaw <name> status`

Non-interactive health/status check for a sandbox.

### stdout
```
✓ Active gateway set to 'nemoclaw'

  Sandbox-scoped status for 'ai-factory-sentinel':
  Sandbox: ai-factory-sentinel
    Model:    nvidia/nemotron-3-super-120b-a12b
    Provider: nvidia-prod
    Inference: reachable (https://inference.local/v1/models)
    Inference (upstream): not probed (NVIDIA Endpoints health requires NVIDIA_INFERENCE_API_KEY; skipping model-invocation probe instead of reporting endpoint reachability as healthy.)
    Serving process (openclaw gateway): not checked
    Host GPU: no
    Sandbox GPU: disabled (0)
    OpenShell: 0.0.85 (docker)
    Policies: none
    Harness:  OpenClaw (gateway)
    Connected: no
    Permissions: not configured (default mutable state)
    Agent:    OpenClaw v2026.6.10

Sandbox:

  Id: 2af67355-01a0-4a0d-8eed-d0316856f7da
  Name: ai-factory-sentinel
  Phase: Ready
  Resource version: 16
  Policy source: sandbox
  Revision: 2

Policy:

  version: 1
  filesystem_policy:
    include_workdir: true
    read_only:
    - /usr
    - /lib
    - /proc
    - /dev/urandom
    - /app
    - /etc
    - /var/log
    read_write:
    - /tmp
    - /dev/null
    - /dev/pts
    - /sandbox/.openclaw
    - /sandbox/.nemoclaw
    - /home/linuxbrew
    - /sandbox
  landlock:
    compatibility: best_effort
  process:
    run_as_user: sandbox
    run_as_group: sandbox
  network_policies:
    clawhub: { host: clawhub.ai, port: 443, enforcement: enforce }
    managed_inference: { host: inference.local, port: 443, enforcement: enforce }
    npm_registry: { host: registry.npmjs.org, port: 443, enforcement: enforce }
    nvidia: { host: integrate.api.nvidia.com, port: 443, enforcement: enforce }
    openclaw_api: { host: openclaw.ai, port: 443, enforcement: enforce }
    openclaw_docs: { host: docs.openclaw.ai, port: 443, enforcement: enforce }
    openclaw_gateway_dialback: { host: 10.200.0.2, ports: [18789, 18790], tls: skip }

    OpenClaw: running
    Docker health: healthy
```
(Full `network_policies` block condensed above for readability — each entry
in the real output also lists per-endpoint `rules` with allowed HTTP
methods/paths and the `binaries` permitted to call that endpoint. See a raw
capture for the full uncondensed form if the wrapper needs per-rule detail.)

### stderr
None observed.

### exit code
`0`

### Key fields for the wrapper contract
| Field | Example value | Notes |
|---|---|---|
| `Sandbox` (name) | `ai-factory-sentinel` | |
| `Model` | `nvidia/nemotron-3-super-120b-a12b` | |
| `Provider` | `nvidia-prod` | |
| `Inference` | `reachable (https://inference.local/v1/models)` | reachability + endpoint URL |
| `Phase` | `Ready` | sandbox lifecycle state — see Day 3 note: can also be stuck in `Provisioning` |
| `Connected` | `no` | whether a `connect` session is currently attached |
| `OpenClaw` | `running` | gateway process state — see Day 3 note: can show `not running` |
| `Docker health` | `healthy` | |
| `Id` | UUID | stable sandbox identifier, distinct from the dynamic container ID shown in `connect` |

### Confirmed (Day 3): `status` self-diagnoses stuck states
When the sandbox gateway has died (e.g. after laptop sleep/restart),
`status` shows `Phase: Provisioning` and `OpenClaw: not running`, and
prints actionable recovery guidance directly:
```
Sandbox 'ai-factory-sentinel' is stuck in 'Provisioning' phase.
This usually happens when a process crash inside the sandbox prevented clean startup.

Run `nemoclaw ai-factory-sentinel rebuild --yes` to recreate the sandbox...

The sandbox is alive but the OpenClaw gateway process is not running.
This typically happens after a gateway restart (e.g., laptop close/open).

To recover, run:
  nemoclaw ai-factory-sentinel connect  (auto-recovers on connect)
```
`status` can be used as a pre-flight health check before attempting `exec`.

---

## `nemoclaw <name> exec -- <command>`

Runs a non-interactive command inside the sandbox via the OpenShell exec
endpoint.

### stdout
```
✓ Active gateway set to 'nemoclaw'
test
```
(Sample command: `nemoclaw ai-factory-sentinel exec -- echo "test"` — the
literal command's stdout, `test`, is appended after the gateway banner line.)

### stderr
None observed for a trivial allowed command. Surfaces correctly for
command failures (confirmed Day 3 — see error handling section below).

### exit code
`0` for successful commands. Confirmed Day 3: non-zero exit codes from the
underlying command propagate correctly through `nemoclaw exec`.

---

## Common banner line

All commands print this line first, before command-specific output:
```
✓ Active gateway set to 'nemoclaw'
```
This confirms which gateway (`nemoclaw`) is currently active/registered —
useful as a sanity check if a wrapper call unexpectedly targets the wrong
gateway.

---

## Error messages observed during setup (not command-specific, but relevant)

These occurred during `onboard`, not `connect`/`status`/`exec`, but are worth
keeping on record since they're real CLI error text:

```
Error:   × execution error: failed to create compute runtime: execution error: failed
  │ to create Docker client: Socket not found: /var/run/docker.sock
```

```
Onboarding did not finish. Resume from the step that failed with:
  nemoclaw onboard --resume
Completed steps are skipped; pass --fresh instead to start over.
```

---

## Parsing Strategy (Day 3)

### Subprocess capture method
Uses `asyncio.create_subprocess_exec` (not blocking `subprocess.run`) since
the wrapper is async FastAPI — a blocking call would freeze the event loop
for all other requests during a NemoClaw invocation.

```python
import asyncio

async def run_nemoclaw_exec(sandbox_name: str, command: list[str], timeout: int = 30):
    process = await asyncio.create_subprocess_exec(
        "nemoclaw", sandbox_name, "exec", "--", *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(), timeout=timeout
        )
        return {
            "stdout": stdout.decode(),
            "stderr": stderr.decode(),
            "returncode": process.returncode,
        }
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise TimeoutError(f"nemoclaw exec timed out after {timeout}s")
```

Confirmed via real testing: `nemoclaw exec` **blocks until the command
completes** — it is not fire-and-forget. `process.communicate()` correctly
waits for actual completion; no separate polling/status-check loop is
needed to detect when a command has finished.

### Mapping exec output to /v1/remediate contract
- Banner line (`✓ Active gateway set to 'nemoclaw'`) is always printed
  first on stdout — strip it before treating the remainder as command output.
- `returncode == 0` → `verified: true`
- `returncode != 0` → `verified: false`, `flagged: true` (see exceptions below)
- Post-banner `stdout` → `output` field
- Combined stdout + stderr → `sandbox_log` field

### Error handling — real captured scenarios

**1. Gateway/Sandbox Unreachable (Connection Refused) + Auto-Recovery**

Symptom:
```
✓ Active gateway set to 'nemoclaw'
Error:   × transport error
  ├─▶ tcp connect error
  ├─▶ tcp connect error
  ╰─▶ Connection refused (os error 111)
```

Root cause (confirmed via `status`): sandbox stuck in `Provisioning` phase,
`OpenClaw: not running` — occurs after laptop sleep/restart kills the
gateway process.

Recovery (confirmed working): `nemoclaw <name> connect` auto-detects the
dead gateway, recreates the sandbox's startup process, reconnects in ~25s.

→ **Wrapper action:** on `Connection refused (os error 111)`, attempt a
`connect`-triggered recovery before falling back to mock — this is
recoverable in ~25s, not necessarily a hard failure requiring immediate
fallback.

**2. Timeout**

Command: `timeout 5 nemoclaw ai-factory-sentinel exec -- sleep 30`
Real elapsed time: **5.84s**
Exit code: **124**
Output: only the banner line — process killed before `sleep` could produce output.

→ **Wrapper action:** `asyncio.wait_for(..., timeout=30)` catches
`asyncio.TimeoutError`, kills the process, returns `flagged: true,
reason: "nemoclaw_cli_timeout"`, auto-falls back to mock.

**3. Non-zero exit code**

Command: `nemoclaw ai-factory-sentinel exec -- false`
Output: `✓ Active gateway set to 'nemoclaw'` (stdout only)
Exit code: **1**

Command: `nemoclaw ai-factory-sentinel exec -- cat /nonexistent-file`
Output:
```
✓ Active gateway set to 'nemoclaw'
cat: /nonexistent-file: No such file or directory
```
(stderr correctly captured separately from stdout)
Exit code: **1**

→ **Wrapper action:** `returncode != 0` → `verified: false`. Recommend:
**do NOT auto-fallback here** — a non-zero exit from the patched command
usually means the patch itself is bad, not that NemoClaw infrastructure is
broken. Auto-fallback should be reserved for infrastructure failures
(timeout, connection refused, OOM), not legitimate patch failures.

**4. OOM — Live Tested (Inconclusive)**

Command: `nemoclaw ai-factory-sentinel exec -- python3 -c "x = ' ' * (10**10)"`
Output: `✓ Active gateway set to 'nemoclaw'` (banner only — no traceback, no
`MemoryError`, no other stderr surfaced)
Exit code: **1**

Result is inconclusive: exit code 1 is generic (matches the same code seen
for `false` and `cat nonexistent-file` in the non-zero-exit tests above).
No `MemoryError` traceback or other OOM-specific signal was surfaced in
stdout/stderr, so we cannot confirm from this test alone whether this was:
(a) an actual OOM condition handled silently, or (b) some other early
failure unrelated to memory (e.g. sandbox network/resource policy
rejecting the command before execution).

Docker-level OOM-kills typically present as exit code **137** (SIGKILL),
which was NOT observed here — suggesting this may not have been a true
OOM-kill, or the sandbox's exec wrapper normalizes kill signals into
generic exit code 1 rather than passing through 137.

→ **Wrapper action (conservative, given ambiguity):** treat exit code 1
with empty/minimal output as a "possible infrastructure issue" and
consider auto-fallback to mock rather than treating it as a definitive
patch failure. This is a deliberately cautious choice given we can't
distinguish "OOM" from "other silent failure" from available signals.
Revisit if stress-testing (Day 13) surfaces a clearer OOM signature under
real load.

### Summary table

| Scenario | Exit Code | Auto-fallback to mock? |
|---|---|---|
| Success | 0 | No — use real result |
| Gateway unreachable (connection refused) | N/A (transport error) | Attempt `connect` recovery first, then fallback if still failing |
| Timeout (>30s) | 124 (shell) / caught via `asyncio.TimeoutError` | Yes |
| Non-zero exit (legitimate patch failure) | 1 | No — return `verified: false` directly |
| OOM (inconclusive signal) | 1 (ambiguous, expected 137) | Yes (conservative choice) |

---

---

## Day 5: Real Adapter Implementation

### Discovery: `exec` has no NemoClaw-specific "apply patch" verb

**Attempted:**
```
nemoclaw ai-factory-sentinel exec -- apply-patch "test patch" --fixture "test_fixture.json"
```

**Result:**
```
✓ Active gateway set to 'nemoclaw'
nemoclaw-runtime-env: line 1: exec: apply-patch: not found
```
Exit code: **127** (standard "command not found")

**Confirmed:** `nemoclaw exec` only runs **literal shell commands** that
exist inside the sandbox (matches every sample seen since Day 1 — `echo`,
`sleep`, `false`, `cat`). There is no special NemoClaw verb for "apply this
patch." The wrapper adapter must construct its own real command — writing
and running the patch logic itself — rather than assuming a
patch-application subcommand exists.

### Working solution: Python one-liner via `exec`

Since `/usr/bin/python3` is present in the sandbox's allowed binaries list
(see `status` → `network_policies` → various endpoints), the adapter now
constructs a `python3 -c "..."` command that receives the patch and
test_fixture as literals and performs the (currently placeholder) patch
logic, printing a JSON result to stdout.

**Verified working, real sandbox run:**
```
Request: {"patch": "test patch", "test_fixture": "test_fixture.json"}

stdout: {"patch_applied": true, "patch": "test patch", "test_fixture": "test_fixture.json"}
exit_code: 0
verified: true
```

### Note on banner location varying by command
In this Day 5 test, the `✓ Active gateway set to 'nemoclaw'` banner (with
ANSI color codes) appeared on **stderr** rather than stdout, unlike earlier
samples where it consistently appeared first on stdout. Current
banner-stripping logic only filters stdout — stderr is passed through
as-is into `sandbox_log`. Not currently causing incorrect `verified`
results (banner location doesn't affect the returncode-based verification
logic), but worth revisiting during Day 8-9 polish if stderr parsing needs
to be cleaner for the dashboard's Sandbox Terminal display.

### Known limitation — placeholder patch logic
The current Python one-liner doesn't perform real patch application; it
echoes back confirmation that the patch/fixture were received. Real patch
semantics (what a "patch" object contains, how it modifies the fixture,
how success/failure is actually determined beyond exit code) depend on
the Remediation Agent's output format, which Nipun defines on Day 7. This
adapter's command-construction logic will need updating once that contract
is locked.

### Updated summary table

| Scenario | Exit Code | Auto-fallback to mock? |
|---|---|---|
| Success | 0 | No — use real result |
| Gateway unreachable (connection refused) | N/A (transport error) | Attempt `connect` recovery first, then fallback if still failing |
| Timeout (>30s) | 124 (shell) / caught via `asyncio.TimeoutError` | Yes |
| Non-zero exit (legitimate patch failure) | 1 | No — return `verified: false` directly |
| OOM (inconclusive signal) | 1 (ambiguous, expected 137) | Yes (conservative choice) |
| `apply-patch` style subcommand (doesn't exist) | 127 | N/A — fixed by using real shell/python commands instead |

---

## Day 9: Integration Day — Auto-Fallback Test Results

Blocker check: "Switch ALL services to PRIMARY mode. Kill NemoClaw
mid-request, verify mock takes over in <5 seconds." Tested against
`real/nemoclaw_adapter.py` directly with real, killable OS subprocesses
standing in for the `nemoclaw` binary (this machine doesn't have it
installed, so PRIMARY mode here already exercises the fallback path for
real, not a simulation of one) — see `wrapper/tests/test_nemoclaw_adapter.py`.

- **Killed mid-request:** measured **0.303s** to fall back to mock
  (blocker requires <5s). Killing the process produces returncode `-9`
  (SIGKILL), which the adapter's `returncode != 0` branch already handles.
- **Binary missing** (this host's actual condition in PRIMARY mode):
  `FileNotFoundError` branch confirmed, contract intact.
- **Non-zero exit, no kill:** confirmed the same branch, contract intact.
- **Full HTTP round-trip** through `wrapper_service.py`'s `/v1/remediate`
  and `/v1/status` in PRIMARY mode: confirmed contract intact end-to-end.

**Fixed:** the adapter previously fell back to mock on *any* non-zero exit
code, contradicting the Day 5 recommendation above (a real patch failure
isn't a NemoClaw infrastructure problem, and silently swapping in a mock
success would hide genuine patch bugs from the Remediation Agent's
verification gate). `real/nemoclaw_adapter.py` now distinguishes:
- Killed by a signal (negative returncode on POSIX, e.g. `-9` for
  SIGKILL) or exit code `137` (Docker's OOM-kill signature) →
  infrastructure failure → auto-fallback to mock, `flagged: true`.
- Any other non-zero exit → real patch failure in a healthy sandbox →
  `verified: false`, `mode: "nemoclaw"`, `flagged: false` — no fallback,
  matches this doc's table exactly. Escalates via the Orchestrator's
  normal `verified: false → ESCALATED` path, not a silent mock success.

Covered by `test_nemoclaw_non_zero_exit_is_a_real_patch_failure_not_a_fallback`
and `test_nemoclaw_oom_exit_code_137_falls_back_to_mock` in
`wrapper/tests/test_nemoclaw_adapter.py`.

Full state machine (HEALTHY → LOOP_SUSPECTED → DIAGNOSING → REMEDIATING →
VERIFYING → RESUMED) with audit hash-chain integrity is covered on the
backend side by `test_full_fsm_verified_true_reaches_resumed` — re-run
clean as part of this pass.