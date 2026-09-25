# Security Policy

## Reporting a vulnerability

Please report vulnerabilities in the specification, schemas, conformance suite or
tooling **privately** through GitHub's
[private vulnerability reporting](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
for this repository. Do not open public issues for undisclosed vulnerabilities.

Include the affected document or file, the protocol version and a description of the
impact. We aim to acknowledge reports within five business days.

## Scope

Specification-level issues are in scope — for example a rule that lets a provider
widen authority, a path that transports secret material, or a conformance gap that
admits unsafe adapters. Vulnerabilities in a particular implementation should be
reported to that implementation's maintainers.

## Secrets

This repository must never contain real credentials. Examples and fixtures use
`secret://` references and obviously fake values that the raw-secret detector
recognizes.
