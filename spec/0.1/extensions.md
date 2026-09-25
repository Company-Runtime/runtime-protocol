# Extensions and Namespaces

| Field    | Value                                              |
| -------- | -------------------------------------------------- |
| Status   | Normative · Experimental                           |
| Protocol | `runtime/0.1`                                      |
| Scope    | Namespaces, extension identifiers, isolation rules |

## 1. Namespaces

| Namespace              | Owner                                | Example                                 | Lives in                                           |
| ---------------------- | ------------------------------------ | --------------------------------------- | -------------------------------------------------- |
| core (implicit)        | The protocol                         | `communication.send`                    | `registry/`                                        |
| `experimental.*`       | The protocol, proposals under review | `experimental.work.claim`               | `extensions/experimental/`                         |
| `community.<author>.*` | A community author                   | `community.acme-labs.document.annotate` | `extensions/community/` or the author's repository |
| `vendor.<vendor>.*`    | A vendor                             | `vendor.example.channel.archive`        | `extensions/vendor/` or the vendor's repository    |
| `org.<org>.*`          | One organization, private            | `org.acme.invoice.reconcile`            | The organization's own registry, never here        |

- The core namespace is **implicit**: core identifiers have no prefix and `core.` MUST
  NOT be written.
- `core`, `experimental`, `community`, `vendor` and `org` are reserved words; no core
  domain may use them.
- `<author>`, `<vendor>` and `<org>` match `^[a-z0-9][a-z0-9-]*$`.

## 2. Extension identifiers

| Kind                   | Grammar                                                                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capability             | `experimental.<domain>.<verb>`, `experimental.<domain>.<object>.<verb>`, or `<ns>.<owner>.<domain>.<verb>` / `<ns>.<owner>.<domain>.<object>.<verb>` where `<ns>` is `community`, `vendor` or `org` |
| Profile                | `experimental.<name>` or `<ns>.<owner>.<name>`                                                                                                                                                      |
| Trait                  | `experimental.<name>` or `<ns>.<owner>.<name>`                                                                                                                                                      |
| Evidence type or claim | `<ns>.<owner>.<name>`                                                                                                                                                                               |
| Event type             | `<ns>.<owner>.<domain>.<past tense>` or core `<domain>.<past tense>`                                                                                                                                |
| `extensions` key       | `experimental` or `<ns>.<owner>`                                                                                                                                                                    |

Extension capabilities SHOULD use core domains and canonical verbs so that promotion
needs no renaming. An extension MAY introduce a new domain only inside its own
namespace (`vendor.example.ledger.record`).

## 3. Isolation rules

1. An extension MUST NOT redefine, shadow or alias a core identifier. A namespaced
   capability whose local part equals a core capability
   (`vendor.example.communication.send`) is invalid — implement the core capability
   instead.
2. A core definition MUST NOT reference extension identifiers, except `experimental.*`
   capabilities listed in `relations.related`.
3. Vendor or product names MAY appear only in `vendor.<vendor>.*` identifiers and in
   adapter metadata.
4. A provider MAY implement core and extension capabilities side by side; an extension
   never changes the semantics of a core capability it also implements.
5. Unknown `extensions` keys MUST be ignored by receivers that do not understand them
   and MUST NOT change core semantics.
6. `org.*` definitions are private to their organization and MUST NOT be submitted to
   this repository.

## 4. Promotion

An `experimental.*` capability that completes the lifecycle in
[GOVERNANCE.md](../../GOVERNANCE.md) is promoted by removing the prefix, keeping the
same domain and verb. The experimental identifier becomes a deprecated alias of the
core identifier for at least one minor protocol version.
