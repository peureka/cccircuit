# circuit-fm — deprecated

**This repository is deprecated and is no longer the source of truth for
Circuit FM. Do not build on it.**

Circuit FM lives in the **`peureka/circuit-test` monorepo**, and
`https://circuit.fm` is served from there.

## Why

Circuit is one company, one network and one product system. Circuit FM is the
member-facing surface of that system, not a separate product with a separate
backend. The One-System Doctrine settled this: one Prisma/Postgres database,
one Circuit identity and consent model, one attendance ledger, one design
system. The host split between `meetcircuit.com` (how rooms and institutions
operate Circuit) and `circuit.fm` (how people experience Circuit) is by
audience; the system does not fork.

This repository is the pre-consolidation FM site, with its own Firebase
backend. That separate backend is the anomaly the doctrine removed.

## State, verified 21 August 2026

- Last meaningful push: **9 May 2026**.
- `cccircuit.vercel.app` and `cccircuit.com`: both return **404**.
- `https://circuit.fm`: served by the monorepo.
- No live domain resolves to this repository.

Its `index.html` still declares `<link rel="canonical" href="https://circuit.fm">`,
which is a stale claim over a domain the monorepo now owns. That is one reason
this notice exists rather than the repo being left quietly alone.

## Status

**Read-only in practice.** Kept, not deleted: the Firebase config and
Firestore rules are the historical record of the pre-consolidation
architecture.

Archival is pending one confirmation: that any remaining Firestore data has
been migrated into the monorepo's models, or exported. Full recommendation and
the open question:
`docs/architecture/CIRCUIT_FM_REPO_DEPRECATION.md` in `peureka/circuit-test`.
