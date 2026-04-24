const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/signup");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeResend } = require("./helpers/fakeResend");
const { createFakeRes } = require("./helpers/fakeRes");

function makeHandler(overrides = {}) {
  const db = overrides.db || createFakeFirestore();
  const resend = overrides.resend || createFakeResend();
  const deps = {
    db,
    resend,
    segmentId: "seg_test",
    from: "Test <test@example.com>",
    timestamp: () => new Date("2026-04-24T00:00:00Z"),
    ...overrides,
  };
  return { handler: createHandler(deps), db, resend };
}

test("POST with email and name stores both on the signup doc", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { email: "Test@Example.com", name: "Ada Lovelace" },
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);

  const doc = await db.collection("signups").doc("test@example.com").get();
  assert.equal(doc.exists, true);
  assert.equal(doc.data().email, "test@example.com");
  assert.equal(doc.data().name, "Ada Lovelace");
});

test("POST with email only still works (backwards compatible)", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  await handler(
    { method: "POST", body: { email: "noname@example.com" } },
    res,
  );

  assert.equal(res.statusCode, 200);
  const doc = await db.collection("signups").doc("noname@example.com").get();
  assert.equal(doc.exists, true);
  assert.equal(doc.data().email, "noname@example.com");
  assert.equal(doc.data().name, undefined);
});

test("POST with missing email returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler({ method: "POST", body: { name: "Missing Email" } }, res);
  assert.equal(res.statusCode, 400);
});

test("POST with invalid email returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler({ method: "POST", body: { email: "not-an-email" } }, res);
  assert.equal(res.statusCode, 400);
});

test("POST with whitespace-only name returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { email: "valid@example.com", name: "   " },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("POST with non-string name returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { email: "valid@example.com", name: 123 },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
});

test("GET returns 405", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler({ method: "GET" }, res);
  assert.equal(res.statusCode, 405);
});

test("name is trimmed before storage", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { email: "valid@example.com", name: "  Grace Hopper  " },
    },
    res,
  );
  const doc = await db.collection("signups").doc("valid@example.com").get();
  assert.equal(doc.data().name, "Grace Hopper");
});

test("duplicate signup (resend 409) returns duplicate=true and no email send", async () => {
  const resend = createFakeResend({ contactsCreate: "duplicate" });
  const { handler } = makeHandler({ resend });
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { email: "already@example.com", name: "Already" },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.duplicate, true);
  assert.equal(resend._calls.emails.length, 0);
});

test("new signup sends a confirmation email via resend", async () => {
  const { handler, resend } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { email: "new@example.com", name: "New Member" },
    },
    res,
  );
  // fire-and-forget send; wait a tick for the catch handler to be registered
  await new Promise((r) => setImmediate(r));
  assert.equal(resend._calls.emails.length, 1);
  assert.equal(resend._calls.emails[0].to[0], "new@example.com");
});

// ---- vouching / leaderboard attribution (session 3) ----

test("POST with voucher_id creates a vouches doc with status 'tapped'", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: {
        email: "friend@example.com",
        name: "Friend Recipient",
        voucher_id: "member-ada",
      },
    },
    res,
  );

  assert.equal(res.statusCode, 200);

  const vouchDoc = await db
    .collection("vouches")
    .doc("member-ada__friend@example.com")
    .get();
  assert.equal(vouchDoc.exists, true);
  const v = vouchDoc.data();
  assert.equal(v.from_member_id, "member-ada");
  assert.equal(v.recipient_email, "friend@example.com");
  assert.equal(v.status, "tapped");
  assert.ok(v.created_at);
});

test("POST without voucher_id does NOT create a vouches doc", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { email: "solo@example.com", name: "Solo" },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  const snap = await db.collection("vouches").get();
  assert.equal(snap.docs.length, 0);
});

test("POST with non-string voucher_id returns 400", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { email: "valid@example.com", name: "Name", voucher_id: 123 },
    },
    res,
  );
  assert.equal(res.statusCode, 400);
  const snap = await db.collection("vouches").get();
  assert.equal(snap.docs.length, 0);
});

test("POST with empty-string voucher_id succeeds but creates no vouch", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: { email: "valid@example.com", name: "Name", voucher_id: "" },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  const snap = await db.collection("vouches").get();
  assert.equal(snap.docs.length, 0);
});

test("Duplicate vouch (same voucher + recipient) is idempotent — one doc only", async () => {
  const { handler, db } = makeHandler();

  const res1 = createFakeRes();
  await handler(
    {
      method: "POST",
      body: {
        email: "dup@example.com",
        name: "Dup",
        voucher_id: "m1",
      },
    },
    res1,
  );

  const res2 = createFakeRes();
  await handler(
    {
      method: "POST",
      body: {
        email: "dup@example.com",
        name: "Dup",
        voucher_id: "m1",
      },
    },
    res2,
  );

  const snap = await db.collection("vouches").get();
  assert.equal(snap.docs.length, 1);
});

test("Email is normalised to lowercase when used in the vouch doc ID", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  await handler(
    {
      method: "POST",
      body: {
        email: "MixedCase@Example.com",
        name: "Mixed",
        voucher_id: "mk1",
      },
    },
    res,
  );

  const vouchDoc = await db
    .collection("vouches")
    .doc("mk1__mixedcase@example.com")
    .get();
  assert.equal(vouchDoc.exists, true);
});
