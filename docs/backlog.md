# circuitfm-web backlog

Items deferred from in-flight work. Add new entries at the top with a date.

## 2026-04-26

- **`test/chip-landing.test.js` references the old `cccircuit` repo path.** Failing locally with `Cannot find module '/Users/roch/Code/cccircuit/api/c/[chipUid].js'`. Leftover from the rebrand. Fix: change the require to `../api/c/[chipUid].js`. Pre-existing — NOT introduced by the Circuit FM list-management work.
- **Backfill existing Firestore signups into Circuit's Circuit FM audience.** After the audience-upsert API is live, write a one-off script that iterates `signups` and POSTs each to `/api/organiser/v1/audience/upsert` so the new system starts populated rather than empty.
- **Decommission the Resend single-segment broadcast.** Once Circuit-native broadcasts ship on meetcircuit.com, retire `api/broadcast.js` + the admin Broadcasts tab. Replace with a link out to Circuit's organiser UI.
