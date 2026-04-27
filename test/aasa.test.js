const test = require("node:test");
const assert = require("node:assert/strict");

const handler = require("../api/aasa");
const { AASA } = require("../api/aasa");
const { createFakeRes } = require("./helpers/fakeRes");

test("GET returns 200 with the AASA JSON and application/json content type", async () => {
  const res = createFakeRes();
  await handler({ method: "GET" }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "application/json");
  const parsed = JSON.parse(res.body);
  assert.deepEqual(parsed, AASA);
});

test("AASA shape matches what was agreed with circuit/", async () => {
  // appIDs MUST match meetcircuit.com's AASA exactly so iOS treats the two
  // hosts as equivalent for universal-link + App Clip dispatch.
  assert.deepEqual(AASA.applinks.details[0].appIDs, [
    "P2FGGF5JJG.com.meetcircuit.guest",
  ]);
  assert.equal(AASA.applinks.details[0].components[0]["/"], "/b/*");
  assert.deepEqual(AASA.appclips.apps, [
    "P2FGGF5JJG.com.meetcircuit.guest.Clip",
  ]);
});

test("HEAD returns 200 with no body but right Content-Type", async () => {
  const res = createFakeRes();
  await handler({ method: "HEAD" }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "application/json");
  assert.equal(res.body, null, "HEAD must not write a body");
  assert.equal(res.ended, true);
});

test("non-GET/HEAD returns 405 with Allow: GET, HEAD", async () => {
  const res = createFakeRes();
  await handler({ method: "POST" }, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers["Allow"], "GET, HEAD");
});

test("Cache-Control is set so previewers + Apple don't hammer", async () => {
  const res = createFakeRes();
  await handler({ method: "GET" }, res);

  assert.match(res.headers["Cache-Control"], /max-age=\d+/);
});
