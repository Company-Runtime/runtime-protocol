# Execution, Observations and Events

| Field    | Value                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------- |
| Status   | Normative · Experimental                                                                           |
| Protocol | `runtime/0.1`                                                                                      |
| Scope    | Execution state machine, processing model, invocations, uncertain outcomes, `Observation`, `Event` |

Schemas: `execution`, `invocation`, `provider-result`, `reconciliation`,
`observation`, `event`.

## 1. State machine

```text
pending ──→ authorized ──→ running ──→ completed
   │  ╲          │            ├──────→ failed
   │   ╲         │            ├──────→ cancelled
   │    ↘        │            └──────→ unknown ──→ completed | failed
   │  awaiting_approval ──→ authorized
   │          │
   └──────────┴──→ rejected | cancelled
```

| State               | Terminal | Meaning                                                                                      |
| ------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `pending`           | no       | Received; validation, authority and policy in progress                                       |
| `awaiting_approval` | no       | Policy requires approval; waiting for a decision                                             |
| `authorized`        | no       | Authority and policy allow it; resolution, credential selection and binding in progress      |
| `running`           | no       | Dispatched to a provider                                                                     |
| `unknown`           | no       | Dispatched, but the outcome cannot be established; must be reconciled, never retried blindly |
| `completed`         | yes      | Performed, with output and all required evidence                                             |
| `failed`            | yes      | Dispatched and proven not completed                                                          |
| `cancelled`         | yes      | Stopped on request before completion                                                         |
| `rejected`          | yes      | Refused or unbindable **before dispatch** — no provider was invoked, no effect occurred      |

Allowed transitions — every other transition is invalid and MUST be refused:

| From                | To                                                         |
| ------------------- | ---------------------------------------------------------- |
| `pending`           | `awaiting_approval`, `authorized`, `rejected`, `cancelled` |
| `awaiting_approval` | `authorized`, `rejected`, `cancelled`                      |
| `authorized`        | `running`, `rejected`, `cancelled`                         |
| `running`           | `completed`, `failed`, `unknown`, `cancelled`              |
| `unknown`           | `completed`, `failed`                                      |

Terminal states never change. Every transition is appended to the execution history
with its time and reason; history is never rewritten.

## 2. Processing model

| Step | Action                                                                            | On failure                      |
| ---- | --------------------------------------------------------------------------------- | ------------------------------- |
| 1    | Create the execution in `pending`                                                 | —                               |
| 2    | Validate the request ([requests.md](requests.md))                                 | `rejected`                      |
| 3    | Evaluate authority ([authority.md](authority.md))                                 | `rejected` (`authority_denied`) |
| 4    | Evaluate policy ([policy.md](policy.md)); wait in `awaiting_approval` if required | `rejected` (`policy_denied`)    |
| 5    | Enter `authorized`                                                                | —                               |
| 6    | Resolve providers ([providers.md](providers.md))                                  | `rejected`                      |
| 7    | Select a credential reference and bind the provider (pre-dispatch checks only)    | next provider, else `rejected`  |
| 8    | Enter `running` and send the invocation                                           | see §4                          |
| 9    | Validate the provider result: output schema, evidence validity, required claims   | see §4                          |
| 10   | Enter the resulting state, store evidence, publish events, issue the receipt      | —                               |

The runtime MUST NOT invoke a provider before step 8.

## 3. Invocation

```yaml
protocol: runtime/0.1
invocation_id: inv_01
execution_id: exec_01
request_id: req_01
capability: { id: communication.send, version: 0.1.0 }
profile: email
traits: [delivery_receipt]
input: { recipients: [identity://customer/981], subject: Account update, content: … }
idempotency_key: identity://user/42/req_01
deadline: 2026-01-01T00:00:30Z
actor: { ref: identity://user/42 }
evidence: { require: [execution, delivery] }
credential: { ref: secret://organization/providers/example-production, owner: organization }
```

The invocation never contains authority or policy decisions, and never secret
material.

## 4. Outcomes

| Provider result or condition                                      | Mutating capability               | Non-mutating capability           |
| ----------------------------------------------------------------- | --------------------------------- | --------------------------------- |
| `completed`, output valid, required claims proven                 | `completed`                       | `completed`                       |
| `completed`, required claim missing                               | `unknown` (`evidence_missing`)    | `failed` (`evidence_missing`)     |
| `completed`, output invalid                                       | `unknown` (`execution_failed`)    | `failed` (`execution_failed`)     |
| `failed` with proof no effect occurred                            | `failed`                          | `failed`                          |
| `unknown`                                                         | `unknown`                         | `failed`                          |
| `running` (with `async` trait)                                    | `running`                         | `running`                         |
| Timeout after dispatch                                            | `unknown` (`timeout`)             | `failed` (`timeout`)              |
| Lost response or transport error after dispatch                   | `unknown` (`execution_failed`)    | `failed` (`execution_failed`)     |
| Error proven to occur before the provider received the invocation | `failed` (`provider_unavailable`) | `failed` (`provider_unavailable`) |

### 4.1 Uncertain outcomes

`unknown` means the effect may or may not have happened.

- A runtime MUST NOT re-send an invocation for an execution in `unknown`, and MUST NOT
  send a new invocation with the same idempotency key while another execution with that
  key is `unknown`.
- The outcome is established only by **reconciliation**: the runtime calls the
  provider's `reconcile` operation with the original invocation.
  - `completed` with evidence → `completed`;
  - `failed` with `final: true` and evidence → `failed`;
  - `inconclusive` → remains `unknown`.
- A runtime MAY retry a dispatched invocation automatically only when the capability is
  non-mutating, or the provider declares the `idempotency` trait for it.

### 4.2 Asynchronous execution

With the `async` trait a provider MAY answer `running`. The runtime keeps the execution
`running` and establishes the outcome through `reconcile` (polling) until a terminal
result or the deadline; at the deadline a mutating execution becomes `unknown`.

### 4.3 Cancellation

- `pending`, `awaiting_approval` and `authorized` executions are cancelled immediately.
- A `running` execution becomes `cancelled` only when the provider confirms that the
  operation was stopped without effect; otherwise it follows the normal outcome rules.
- Cancelling a terminal execution has no effect.

## 5. Observation, Event and Action are distinct

```text
Observation: temperature = 92 °C              (a measurement)
  → Event: machine.overheated                 (a fact someone declared)
  → Capability Request: execution.execute     (an action someone asked for)
```

A runtime MUST NOT turn an observation into an action, or an event into an action,
without an explicit capability request subject to authority and policy.

### 5.1 Observation

```yaml
protocol: runtime/0.1
id: obs_01
subject: { ref: resource://plant/machine-7 }
property: temperature
value: 92
unit: Cel
observed_at: 2026-01-01T00:00:00Z
observer: { ref: identity://sensor/thermo-3 }
```

`unit` SHOULD use UCUM codes.

### 5.2 Event

```yaml
protocol: runtime/0.1
id: evt_01
type: communication.sent
source: runtime://example-runtime
time: 2026-01-01T00:00:01Z
subject: { ref: resource://outbox/msg-1 }
causation: { execution_id: exec_01, request_id: req_01 }
data: { capability: communication.send, output: { … } }
```

- Event types are `<domain>.<past tense of verb>` for core facts, or namespaced
  (`org.acme.machine.overheated`).
- When an execution of a capability reaches `completed`, the runtime MUST publish one
  event for each type in the capability's `emits`, with `causation.execution_id` set.
- Events are facts. They never carry authority, and receiving an event never authorizes
  an action.
