const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/provision-card");
const { createFakeFirestore } = require("./helpers/fakeFirestore");
const { createFakeRes } = require("./helpers/fakeRes");

const SECRET = "prov-test-secret";

function makeHandler(overrides = {}) {
  const db = overrides.db || createFakeFirestore();
  return {
    handler: createHandler({
      db,
      adminSecret: SECRET,
      timestamp: () => new Date("2026-04-24T00:00:00Z"),
      ...overrides,
    }),
    db,
  };
}

function authed(body) {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}` },
    body,
  };
}

test("POST with chipUids array creates unassigned card docs", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();

  await handler(
    authed({ chipUids: ["chip-a", "chip-b", "chip-c"] }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.created, 3);
  assert.equal(res.body.skipped, 0);

  for (const id of ["chip-a", "chip-b", "chip-c"]) {
    const doc = await db.collection("cards").doc(id).get();
    assert.equal(doc.exists, true);
    assert.equal(doc.data().status, "unassigned");
    assert.equal(doc.data().member_id, null);
    assert.ok(doc.data().created_at);
  }
});

test("POST skips chipUids that are already provisioned (idempotent)", async () => {
  const db = createFakeFirestore();
  // Pre-seed one already-active card
  await db.collection("cards").doc("chip-a").set({
    member_id: "member-x",
    status: "active",
  });

  const { handler } = makeHandler({ db });
  const res = createFakeRes();

  await handler(
    authed({ chipUids: ["chip-a", "chip-b"] }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.created, 1);
  assert.equal(res.body.skipped, 1);

  // chip-a not overwritten
  const a = await db.collection("cards").doc("chip-a").get();
  assert.equal(a.data().status, "active");
  assert.equal(a.data().member_id, "member-x");
});

test("POST without auth returns 401", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    { method: "POST", body: { chipUids: ["x"] } },
    res,
  );
  assert.equal(res.statusCode, 401);
});

test("POST with empty chipUids array returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(authed({ chipUids: [] }), res);
  assert.equal(res.statusCode, 400);
});

test("POST with non-array chipUids returns 400", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(authed({ chipUids: "not-array" }), res);
  assert.equal(res.statusCode, 400);
});

test("POST trims and dedups whitespace / duplicate chipUids", async () => {
  const { handler, db } = makeHandler();
  const res = createFakeRes();
  await handler(
    authed({ chipUids: ["chip-1", "  chip-1  ", "chip-2", ""] }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.created, 2);

  const snap = await db.collection("cards").get();
  assert.equal(snap.docs.length, 2);
});

test("GET returns 405", async () => {
  const { handler } = makeHandler();
  const res = createFakeRes();
  await handler(
    { method: "GET", headers: { authorization: `Bearer ${SECRET}` } },
    res,
  );
  assert.equal(res.statusCode, 405);
});
