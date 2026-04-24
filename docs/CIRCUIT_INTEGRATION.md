# Circuit ↔ Culture Club Integration

How Circuit check-ins automatically populate Culture Club attendance, advance
vouches, and keep the leaderboard honest in real time.

---

## Architecture

Two separate products, one shared event:

```
Guest taps Block at LINECONIC entrance
  ↓
Circuit records check-in  (circuit repo, Next.js + Prisma + Postgres)
  ↓  (webhook dispatch)
cccircuit receives webhook  (this repo, Firebase + Vercel Functions)
  ↓
attendance doc written + matching vouches advanced tapped→floor
  ↓
/board re-ranks
```

Neither side hard-depends on the other. Circuit runs fine without Culture
Club (it's a general attendance system). Culture Club runs fine without
Circuit (attendance can be recorded manually via `/api/attendance` or the
admin panel's "record attendance" form). The webhook is a convenience, not
a coupling.

---

## What's already built

### cccircuit side (complete)
- **`POST /api/webhooks/circuit-checkin`** — receives Circuit `attendance.created`
  events. Verifies Circuit's Stripe-style signature (`t=<ts>,v1=<hmac>`), rejects
  stale timestamps (>5min). Maps Circuit eventId → Culture Club outing via
  `outings.circuit_event_id`. Records attendance, advances `tapped → floor`
  vouches, returns an action tag on every 2xx (`attendance_recorded`,
  `skipped_unmapped_event`, `skipped_no_email`, `ignored_event_type`).
- **`outings.circuit_event_id` field** — optional string on outings. Settable
  via the admin form's "circuit event id" input.

### circuit side (already exists — no code changes needed)
- **Enterprise webhook dispatch** at `src/lib/enterprise-webhooks.ts` with retries
  (1m, 5m, 30m, 2h, 12h), Stripe-style signing, per-org subscriptions.
- **`attendance.created` events fired** from `src/lib/checkin-pipeline.ts:125`
  automatically on every check-in. Payload shape matches what cccircuit expects.
- **Admin endpoint** for managing webhook subscriptions at
  `/api/enterprise/v1/webhooks`.

Circuit's existing dispatch is the contract. cccircuit's receiver now honours
it exactly — same signature format, same payload shape.

## What needs to happen (Circuit ops — no code required)

### 1. Create Culture Club as an Organisation on Circuit

Three rows in Circuit's Postgres (or the equivalent through Circuit's admin UI
when it exists):

```sql
-- Organisation
INSERT INTO "Organisation" (id, name, slug, /* ... */)
VALUES (gen_random_uuid(), 'Culture Club', 'culture-club', /* ... */);

-- Location for Soho House Greek Street
INSERT INTO "Location" (id, organisation_id, name, address, /* ... */)
VALUES (gen_random_uuid(), '<org-uuid>', 'Soho House — Greek Street', '...', /* ... */);

-- Organiser membership so PJ / Ciara / Ashton can manage
INSERT INTO "OrganisationMember" (organisation_id, organiser_id, role)
VALUES ('<org-uuid>', '<pj-organiser-id>', 'admin');
```

### 2. Provision a Block for the Location

Use the existing circuit script: `scripts/provision-block.ts`. Mount the
Block at the entrance of Soho House Greek Street for the May 20 show.

### 3. Create the May 20 Event

Via Circuit's existing organiser event-creation flow:
- **Name:** `LINECONIC May 20`
- **Format:** `show`
- **Organisation:** Culture Club
- **Location:** Soho House — Greek Street
- **Date:** 2026-05-20
- Copy the resulting `Event.id` — goes into cccircuit's outing in Step 5.

### 4. Configure the webhook subscription

Generate a shared secret once:
```bash
openssl rand -hex 32
```

Store it in BOTH Vercel projects under the corresponding env var name:
- `circuit` project (Vercel): add to the webhook row below as `signing_secret`.
- `cccircuit` project (Vercel): `CIRCUIT_WEBHOOK_SECRET = <value>`.

Create the subscription row in Circuit's Postgres:

```sql
INSERT INTO "EnterpriseWebhook" (
  id,
  organisation_id,
  url,
  signing_secret,
  events,
  active,
  created_at
) VALUES (
  gen_random_uuid(),
  '<culture-club-org-uuid>',
  'https://www.cccircuit.com/api/webhooks/circuit-checkin',
  '<shared-secret-from-above>',
  ARRAY['attendance.created'],
  true,
  NOW()
);
```

Or, if you have an admin UI / API route for managing enterprise webhooks
(Circuit has `/api/enterprise/v1/webhooks`), POST the equivalent payload
through that.

### 5. Link the Circuit Event to the Culture Club outing

cccircuit admin → Outings → edit the May 20 outing → paste the Circuit
`Event.id` from Step 3 into the `circuit_event_id` field → save.

From now on, every tap at the Soho House Block at that event dispatches a
webhook to cccircuit, which records attendance and advances any matching
`tapped` vouches to `floor` (+3 score to each voucher).

## What Circuit actually sends (the contract cccircuit now matches exactly)

**Signature header** (`x-circuit-signature`):
```
t=<unix-timestamp-seconds>,v1=<hmac-sha256-hex-of-"<ts>.<body>"-using-signing_secret>
```

**Payload** (from `circuit/src/lib/checkin-pipeline.ts:125`):

```json
{
  "type": "attendance.created",
  "orgId": "<culture-club-org-uuid>",
  "locationId": "<soho-house-location-uuid>",
  "eventId": "<circuit-event-uuid>",
  "guest": {
    "guestId": "<circuit-guest-uuid>",
    "email": "ada@example.com",
    "totalVisits": 3,
    "currentStreak": 2
  },
  "attendedAt": "2026-05-20T20:15:00Z",
  "source": "tap",
  "idempotencyKey": "<circuit-return-record-uuid>"
}
```

**Headers:**
- `content-type: application/json`
- `x-circuit-signature: t=...,v1=...`
- `x-circuit-event-id: <delivery-uuid>`
- `x-circuit-event-type: attendance.created`

### 4. Link the Circuit Event to the Culture Club outing

Once the May 20 Event exists on Circuit:
1. Copy the Event ID
2. In cccircuit admin: Outings tab → edit the May 20 outing → paste the
   Circuit Event ID into `circuit_event_id` field → save.

From that moment on, every tap at the Block at that event flows through
the webhook → attendance → leaderboard.

### 5. (Optional) Surface Culture Club attendance in Circuit

Not required, but the reverse flow is valuable for the SEIS pitch: Circuit
can query Culture Club's leaderboard to show which guests are top vouchers.
This would be a simple cccircuit endpoint (`GET /api/board?expanded=true`
with auth, returning member emails + scores). Deferred until Circuit needs it.

---

## Testing the integration

**One-line signed curl** (using the shared secret in `CIRCUIT_WEBHOOK_SECRET`):

```bash
SECRET="<your-shared-secret>"
TS=$(date +%s)
BODY='{"type":"attendance.created","eventId":"test","guest":{"email":"test@example.com"},"attendedAt":"2026-05-20T20:15:00Z","source":"tap","idempotencyKey":"smoke-1"}'
SIG="t=${TS},v1=$(printf '%s' "${TS}.${BODY}" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')"
curl -X POST https://www.cccircuit.com/api/webhooks/circuit-checkin \
  -H "Content-Type: application/json" \
  -H "X-Circuit-Signature: $SIG" \
  -d "$BODY"
```

Expected: `200 OK` with `action: "skipped_unmapped_event"` (no outing maps
to `eventId = "test"`). Confirms the receiver is live and the signature
verifies. If the secret is wrong: `401 Invalid signature`.

**End-to-end on May 18 dry run:** tap the Block at the May 20 event (pre-show
setup), then check cccircuit admin → Dashboard → the attendance count for
that outing bumps by 1 and any vouch pointing at that email advances to floor.

**End-to-end (May 20 dry run, 2026-05-18):**
1. Circuit has Culture Club org + Soho House location + Block + event + webhook configured
2. Tap the Block with your phone
3. Check `cccircuit.com/admin` → Dashboard → outings — attendance count for the May 20 outing should bump
4. Check `/board` — if you were a vouched recipient, your voucher's rank should update

---

## Failure modes and what to do

| Failure | What you see | Fix |
|---|---|---|
| Signature mismatch | Circuit webhook logs 401 from cccircuit | Secrets out of sync. Regenerate, update BOTH Vercel projects, redeploy both. |
| `skipped_unmapped_event` in cccircuit logs | Taps not producing attendance | Outing's `circuit_event_id` is wrong or empty. Copy Event ID from Circuit, paste into outing form. |
| `skipped_no_email` | Walk-in guests without email don't count | Expected. Culture Club attendance is email-keyed because vouches are email-keyed. If many walk-ins, manual entry via admin panel's "record attendance" form. |
| Webhook never fires | No activity in cccircuit logs | Circuit's webhook subscription not configured or the event-type filter excludes check-ins. Check Circuit's webhook admin. |
| Duplicate attendance | Attendance for same (outing, email) tried twice | Idempotent by design. Second write is a no-op. Vouch advancement is idempotent too (vouches at "floor" aren't re-touched). |

---

## The SEIS-deck payoff

Once this is wired, Circuit can produce statements like:

> "Culture Club ran 14 outings between May and September 2026. 47 members
> attended 4+ outings across all four formats. Cross-venue identity: 62%
> of Culture Club Core Members also attended at least one event at a
> separate operator venue on Circuit. Return-rate by operator: Albany 68%,
> tvg 54%, Copeland 71%."

None of that exists yet. The data infrastructure to produce it does, as of
this integration landing.
