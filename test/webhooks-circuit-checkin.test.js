const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  createHandler,
  parseSignatureHeader,
  verifySignature,
} = require("../api/webhooks/circuit-checkin");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeRes } = require("./helpers/fakeRes");

const SECRET = "circuit-webhook-test-secret";

// Stripe-style signature, matching Circuit's signEnterpriseWebhook:
//   payload = `${timestampSeconds}.${body}`
//   header  = `t=${timestampSeconds},v1=${hex}`
function signCircuit(body, { timestampSeconds, secret = SECRET } = {}) {
  const ts = timestampSeconds ?? Math.floor(Date.now() / 1000);
  const payload = `${ts}.${typeof body === "string" ? body : JSON.stringify(body)}`;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return { header: `t=${ts},v1=${hmac}`, ts };
}

function makeHandler(overrides = {}) {
  const db = overrides.db || createFakeFirestore();
  return {
    handler: createHandler({
      db,
      webhookSecret: SECRET,
      timestamp: () => new Date("2026-05-20T20:00:00Z"),
      now: overrides.now ?? (() => Math.floor(Date.now() / 1000)),
      ...overrides,
    }),
    db,
  };
}

function req(body, { signature, timestampSeconds, secret, eventType } = {}) {
  const stringBody = typeof body === "string" ? body : JSON.stringify(body);
  const sig =
    signature ??
    signCircuit(stringBody, { timestampSeconds, secret }).header;
  return {
    method: "POST",
    headers: {
      "x-circuit-signature": sig,
      "x-circuit-event-id": "delivery-abc",
      "x-circuit-event-type": eventType || "attendance.created",
      "content-type": "application/json",
    },
    body: typeof body === "string" ? JSON.parse(body) : body,
    rawBody: stringBody,
  };
}

async function seedOuting(db, outingId, circuitEventId) {
  await db.collection("outings").doc(outingId).set({
    name: "LINECONIC May 20",
    format: "Watch",
    date: "2026-05-20",
    venue: "Soho House — Greek Street",
    circuit_event_id: circuitEventId,
    status: "scheduled",
  });
}

// --- Signature helpers ---

test("parseSignatureHeader handles t=..,v1=.. in either order", () => {
  assert.deepEqual(parseSignatureHeader("t=1700000000,v1=deadbeef"), {
    timestamp: 1700000000,
    signature: "deadbeef",
  });
  assert.deepEqual(parseSignatureHeader("v1=cafe,t=1700000001"), {
    timestamp: 1700000001,
    signature: "cafe",
  });
  assert.equal(parseSignatureHeader(""), null);
  assert.equal(parseSignatureHeader("t=,v1=abc"), null);
  assert.equal(parseSignatureHeader("v1=abc"), null); // missing t
});

test("verifySignature accepts a correctly signed body", () => {
  const body = '{"type":"attendance.created"}';
  const { header, ts } = signCircuit(body);
  assert.equal(
    verifySignature({
      rawBody: body,
      header,
      secret: SECRET,
      nowSeconds: ts,
    }),
    true,
  );
});

test("verifySignature rejects a stale timestamp (>5min old)", () => {
  const body = '{"type":"attendance.created"}';
  const ts = 1_700_000_000;
  const { header } = signCircuit(body, { timestampSeconds: ts });
  assert.equal(
    verifySignature({
      rawBody: body,
      header,
      secret: SECRET,
      nowSeconds: ts + 301, // 5m 1s later
    }),
    false,
  );
});

test("verifySignature rejects a timestamp too far in the future", () => {
  const body = '{"type":"attendance.created"}';
  const ts = 1_700_000_000;
  const { header } = signCircuit(body, { timestampSeconds: ts });
  assert.equal(
    verifySignature({
      rawBody: body,
      header,
      secret: SECRET,
      nowSeconds: ts - 301, // now is 5m 1s BEFORE the signed ts
    }),
    false,
  );
});

test("verifySignature rejects a tampered body", () => {
  const body = '{"type":"attendance.created"}';
  const { header, ts } = signCircuit(body);
  assert.equal(
    verifySignature({
      rawBody: body + "tampered",
      header,
      secret: SECRET,
      nowSeconds: ts,
    }),
    false,
  );
});

// --- Handler happy path with Circuit's actual payload shape ---

test("POST with valid Circuit-shaped payload records attendance + advances vouches", async () => {
  const db = createFakeFirestore();
  await seedOuting(db, "out-may-20", "circuit-evt-123");
  await db.collection("vouches").doc("voucher-1__ada@example.com").set({
    from_member_id: "voucher-1",
    recipient_email: "ada@example.com",
    status: "tapped",
  });

  const body = {
    type: "attendance.created",
    orgId: "org-culture-club",
    locationId: "loc-soho-house",
    eventId: "circuit-evt-123",
    guest: {
      guestId: "guest-abc",
      email: "Ada@Example.com",
      totalVisits: 1,
      currentStreak: 1,
    },
    attendedAt: "2026-05-20T20:15:00Z",
    source: "tap",
    idempotencyKey: "return-xyz-789",
  };

  const { handler } = makeHandler({ db });
  const res = createFakeRes();

  await handler(req(body), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.action, "attendance_recorded");
  assert.equal(res.body.outing_id, "out-may-20");
  assert.equal(res.body.vouches_advanced, 1);

  const attendance = await db
    .collection("attendance")
    .doc("out-may-20__ada@example.com")
    .get();
  assert.equal(attendance.exists, true);
  assert.equal(attendance.data().source, "circuit_webhook");
  // The Circuit delivery idempotency key is recorded for audit
  assert.equal(attendance.data().circuit_return_id, "return-xyz-789");

  const vouch = await db
    .collection("vouches")
    .doc("voucher-1__ada@example.com")
    .get();
  assert.equal(vouch.data().status, "floor");
});

test("POST unmapped eventId → 200 with skipped_unmapped_event", async () => {
  const { handler } = makeHandler();
  const body = {
    type: "attendance.created",
    eventId: "unknown-event",
    guest: { email: "a@x.com" },
    attendedAt: "2026-05-20T20:15:00Z",
    source: "tap",
    idempotencyKey: "k1",
  };
  const res = createFakeRes();
  await handler(req(body), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.action, "skipped_unmapped_event");
});

test("POST no guest email → 200 with skipped_no_email", async () => {
  const db = createFakeFirestore();
  await seedOuting(db, "o1", "evt-1");
  const { handler } = makeHandler({ db });

  const body = {
    type: "attendance.created",
    eventId: "evt-1",
    guest: { name: "Walk-in", phone: "+44000000" },
    attendedAt: "2026-05-20T20:15:00Z",
    source: "walkin",
    idempotencyKey: "k2",
  };
  const res = createFakeRes();
  await handler(req(body), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.action, "skipped_no_email");
});

test("POST with event type other than attendance.created is ignored", async () => {
  const { handler } = makeHandler();
  const body = {
    type: "unlock.granted",
    eventId: "evt-1",
    guest: { email: "e@x.com" },
    idempotencyKey: "k3",
  };
  const res = createFakeRes();
  await handler(req(body, { eventType: "unlock.granted" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.action, "ignored_event_type");
});

// --- Signature rejection paths ---

test("POST with invalid signature returns 401", async () => {
  const { handler } = makeHandler();
  const body = { type: "attendance.created", eventId: "e", idempotencyKey: "k" };
  const res = createFakeRes();
  await handler(req(body, { signature: "t=1700000000,v1=deadbeef" }), res);
  assert.equal(res.statusCode, 401);
});

test("POST missing signature header returns 401", async () => {
  const { handler } = makeHandler();
  const body = { type: "attendance.created" };
  const r = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    rawBody: JSON.stringify(body),
  };
  const res = createFakeRes();
  await handler(r, res);
  assert.equal(res.statusCode, 401);
});

test("POST with stale timestamp returns 401", async () => {
  // Sign as if now is 2026-05-20T20:00:00Z (matches makeHandler's default timestamp())
  const now = Math.floor(Date.UTC(2026, 4, 20, 20, 0, 0) / 1000);
  const staleTs = now - 400; // 6m 40s old, past the 5m window

  const { handler } = makeHandler({ now: () => now });
  const body = { type: "attendance.created", eventId: "e", idempotencyKey: "k" };
  const res = createFakeRes();
  await handler(req(body, { timestampSeconds: staleTs }), res);
  assert.equal(res.statusCode, 401);
});

test("POST missing rawBody returns 400", async () => {
  const { handler } = makeHandler();
  const r = {
    method: "POST",
    headers: { "x-circuit-signature": "t=1,v1=abc" },
    body: { type: "attendance.created" },
    // rawBody missing
  };
  const res = createFakeRes();
  await handler(r, res);
  assert.equal(res.statusCode, 400);
});

test("GET returns 405", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler({ method: "GET", headers: {}, rawBody: "" }, res);
  assert.equal(res.statusCode, 405);
});

// --- Idempotency ---

test("POST is idempotent — replayed check-in doesn't duplicate attendance", async () => {
  const db = createFakeFirestore();
  await seedOuting(db, "out-rep", "evt-rep");
  const body = {
    type: "attendance.created",
    eventId: "evt-rep",
    guest: { email: "x@x.com" },
    attendedAt: "2026-05-20T20:15:00Z",
    source: "tap",
    idempotencyKey: "k-replay",
  };

  const { handler } = makeHandler({ db });
  await handler(req(body), createFakeRes());
  await handler(req(body), createFakeRes());

  const snap = await db.collection("attendance").get();
  assert.equal(snap.docs.length, 1);
});
