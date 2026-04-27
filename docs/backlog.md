# circuitfm-web backlog

Items deferred from in-flight work. Add new entries at the top with a date.

## 2026-04-27

- [ ] **Decommission `api/broadcast.js` + admin Broadcasts tab** in `admin.html`. Circuit-native broadcasts are now live on `meetcircuit.com/dashboard/broadcasts` (circuit-test#34, merged 2026-04-27). The legacy Resend single-segment path in this repo becomes a footgun — two ways to send means the wrong one will eventually be used. Replace the admin tab with a link out to Circuit's broadcasts UI, or remove it entirely once you've sent at least one Circuit-native broadcast successfully. Gated on real usage at non-trivial scale, not a current blocker.

## 2026-04-26

- [x] ~~**`test/chip-landing.test.js` references the old `cccircuit` repo path.**~~ Fixed in #2 (`aacfa6e`) — `require("../api/c/[chipUid].js")`.
- [x] ~~**Backfill existing Firestore signups into Circuit's Circuit FM audience.**~~ Script shipped in #4 (`ddf4202`); execution moot — only 2 signups, both PJ's. Re-run if/when the legacy list grows.
- (above) **Decommission the Resend single-segment broadcast.** Promoted to top with circuit-test#34 context.
