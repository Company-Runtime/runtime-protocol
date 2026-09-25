# Events Binding — `events/0.1`

| Field    | Value                                 |
| -------- | ------------------------------------- |
| Status   | Normative · Experimental              |
| Protocol | `runtime/0.1`                         |
| Format   | CloudEvents 1.0, structured JSON mode |

Protocol events ([spec/0.1/execution.md](../../spec/0.1/execution.md)) are carried as
CloudEvents 1.0. The mapping is **lossless**: converting an event to a CloudEvent and
back yields the same event.

## 1. Attribute mapping

| Protocol event             | CloudEvents attribute                                             |
| -------------------------- | ----------------------------------------------------------------- |
| `protocol`                 | `runtimeprotocol` (extension) = `runtime/0.1`                     |
| `id`                       | `id`                                                              |
| `source`                   | `source`                                                          |
| `type`                     | `type` (unchanged, for example `communication.sent`)              |
| `time`                     | `time`                                                            |
| `subject.ref`              | `subject`                                                         |
| `subject.type`             | `subjecttype` (extension)                                         |
| `subject.version`          | `subjectversion` (extension)                                      |
| `data`                     | `data`, with `datacontenttype: application/json`                  |
| `causation.execution_id`   | `executionid` (extension)                                         |
| `causation.request_id`     | `requestid` (extension)                                           |
| `causation.observation_id` | `observationid` (extension)                                       |
| `causation.event_id`       | `causationid` (extension)                                         |
| `correlation_id`           | `correlationid` (extension)                                       |
| `extensions`               | `runtimeextensions` (extension), the RFC 8785 canonical JSON text |

`specversion` is `1.0`. Absent protocol fields produce absent attributes.

## 2. Delivery

- Delivery is at-least-once. Consumers deduplicate by (`source`, `id`).
- Order is not guaranteed across subjects.
- A consumer MUST NOT treat an event as a request. Reacting to an event means
  submitting a new capability request, evaluated for authority and policy like any
  other.

## 3. Observation → Event → Action

```text
Observation (temperature = 92 °C)
  → Event org.acme.machine.overheated  (causation.observation_id = obs_01)
  → CapabilityRequest execution.execute (context.causation_id = evt_07)
```

Each arrow is an explicit decision by an actor; none happens implicitly.
