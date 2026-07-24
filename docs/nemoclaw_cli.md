# NemoClaw CLI Reference

Documentation of real `nemoclaw` CLI output, captured from an actual sandbox
(`ai-factory-sentinel`) on 2026-07-24. This is the source of truth for the
mock wrapper contract (`POST /v1/remediate`).

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
| `Phase` | `Ready` | sandbox lifecycle state |
| `Connected` | `no` | whether a `connect` session is currently attached |
| `OpenClaw` | `running` | gateway process state |
| `Docker health` | `healthy` | |
| `Id` | UUID | stable sandbox identifier, distinct from the dynamic container ID shown in `connect` |

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
None observed for a trivial allowed command. Expect stderr to surface here
for command failures or policy-blocked network calls (see the `CONNECT
tunnel failed, response 403` message noted under `connect` above — this is
the error text to expect if an `exec`'d command tries an outbound call not
covered by `network_policies`).

### exit code
`0`

---

## Common banner line

All three commands print this line first, before command-specific output:
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

## Draft JSON contract (for wrapper input/output)

Based on the field set above, a reasonable JSON shape for `status` data
feeding into `POST /v1/remediate`:

```json
{
  "sandbox": {
    "id": "2af67355-01a0-4a0d-8eed-d0316856f7da",
    "name": "ai-factory-sentinel",
    "phase": "Ready",
    "connected": false
  },
  "model": {
    "name": "nvidia/nemotron-3-super-120b-a12b",
    "provider": "nvidia-prod"
  },
  "inference": {
    "reachable": true,
    "endpoint": "https://inference.local/v1/models",
    "upstream_probed": false
  },
  "openclaw": {
    "status": "running",
    "version": "2026.6.10"
  },
  "docker_health": "healthy",
  "exit_code": 0,
  "stderr": null
}
```

> ⚠️ This is a proposed mapping, not yet verified against Nipun's actual
> `/v1/remediate` schema. Cross-check field names/types with his contract
> before finalizing.