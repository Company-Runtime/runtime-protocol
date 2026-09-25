# Extensions

New semantics start outside the core ([spec/0.1/extensions.md](../spec/0.1/extensions.md)).
This directory holds publicly registered extension definitions:

| Directory                        | Namespace              | For                                             |
| -------------------------------- | ---------------------- | ----------------------------------------------- |
| [`experimental/`](experimental/) | `experimental.*`       | Proposals on their way to the core              |
| [`community/`](community/)       | `community.<author>.*` | Community definitions registered for visibility |
| [`vendor/`](vendor/)             | `vendor.<vendor>.*`    | Vendor-specific behaviour absent from the core  |

`org.<org>.*` definitions are private to their organization and never live here.

Each capability has its own directory with the same files as a core capability —
`capability.yaml`, `input.schema.json`, `output.schema.json` — plus `proposal.md`
answering the ten questions, referenced by `proposal_ref`. The semantic lint checks
every definition here with the same rules as the core, and enforces that an extension
never shadows a core identifier.
