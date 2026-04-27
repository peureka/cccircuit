const test = require("node:test");
const assert = require("node:assert/strict");

const { createHandler } = require("../api/b/[chipUid]");
const { createFakeRes } = require("./helpers/fakeRes");

function fakeFetch({ status = 200, location = null, body = "", contentType = null, throwError = null } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (throwError) throw throwError;
    return {
      status,
      headers: {
        get(name) {
          const lower = name.toLowerCase();
          if (lower === "location") return location;
          if (lower === "content-type") return contentType;
          return null;
        },
      },
      async text() {
        return body;
      },
    };
  };
  fn._calls = calls;
  return fn;
}

const CHIP = "07a6d12a-2662-4857-8ce2-04eb31c09b0b";

test("non-GET/HEAD returns 405 with Allow header", async () => {
  const handler = createHandler({ fetchImpl: fakeFetch() });
  const res = createFakeRes();
  await handler({ method: "POST", query: { chipUid: CHIP } }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers["Allow"], "GET, HEAD");
});

test("missing chipUid returns 400", async () => {
  const handler = createHandler({ fetchImpl: fakeFetch() });
  const res = createFakeRes();
  await handler({ method: "GET", query: {} }, res);
  assert.equal(res.statusCode, 400);
});

test("non-string chipUid returns 400", async () => {
  const handler = createHandler({ fetchImpl: fakeFetch() });
  const res = createFakeRes();
  await handler({ method: "GET", query: { chipUid: ["x"] } }, res);
  assert.equal(res.statusCode, 400);
});

test("GET with valid SDM params relays a 302 redirect", async () => {
  const fetchImpl = fakeFetch({
    status: 302,
    location: "https://meetcircuit.com/checkin/abc-123",
  });
  const handler = createHandler({ fetchImpl, upstreamHost: "https://meetcircuit.com" });
  const res = createFakeRes();
  await handler(
    {
      method: "GET",
      query: { chipUid: CHIP, picc_data: "AABB", cmac: "CCDD" },
    },
    res,
  );
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers["Location"], "https://meetcircuit.com/checkin/abc-123");
  assert.equal(res.headers["Cache-Control"], "no-store");

  // Verify upstream was called with the right URL + query params relayed
  const call = fetchImpl._calls[0];
  assert.match(call.url, new RegExp(`/b/${CHIP}\\?`));
  assert.match(call.url, /picc_data=AABB/);
  assert.match(call.url, /cmac=CCDD/);
});

test("GET strips chipUid from query string when forwarding (route param, not body)", async () => {
  const fetchImpl = fakeFetch({ status: 302, location: "https://x.test/" });
  const handler = createHandler({ fetchImpl, upstreamHost: "https://meetcircuit.com" });
  const res = createFakeRes();
  await handler(
    {
      method: "GET",
      query: { chipUid: CHIP, picc_data: "AABB", cmac: "CCDD" },
    },
    res,
  );
  // chipUid should appear in the path, NOT duplicated in the query string
  const url = new URL(fetchImpl._calls[0].url);
  assert.equal(url.pathname, `/b/${CHIP}`);
  assert.equal(url.searchParams.get("chipUid"), null);
  assert.equal(url.searchParams.get("picc_data"), "AABB");
});

test("GET relays 403 from upstream (failed SDM verify)", async () => {
  const fetchImpl = fakeFetch({
    status: 403,
    body: "Invalid tap signature",
    contentType: "text/plain",
  });
  const handler = createHandler({ fetchImpl });
  const res = createFakeRes();
  await handler(
    {
      method: "GET",
      query: { chipUid: CHIP, picc_data: "AABB", cmac: "CCDD" },
    },
    res,
  );
  assert.equal(res.statusCode, 403);
  assert.equal(res.headers["Content-Type"], "text/plain");
  assert.equal(res.body, "Invalid tap signature");
});

test("GET relays 404 from upstream (block not found)", async () => {
  const fetchImpl = fakeFetch({ status: 404, body: "Not found", contentType: "text/plain" });
  const handler = createHandler({ fetchImpl });
  const res = createFakeRes();
  await handler({ method: "GET", query: { chipUid: CHIP } }, res);
  assert.equal(res.statusCode, 404);
});

test("GET returns 503 when upstream is unreachable", async () => {
  const fetchImpl = fakeFetch({ throwError: new Error("ECONNREFUSED") });
  const handler = createHandler({ fetchImpl });
  const res = createFakeRes();
  await handler({ method: "GET", query: { chipUid: CHIP } }, res);
  assert.equal(res.statusCode, 503);
});

test("GET returns 504 when upstream times out", async () => {
  const err = new Error("Headers Timeout Error");
  err.cause = { code: "UND_ERR_HEADERS_TIMEOUT" };
  const fetchImpl = fakeFetch({ throwError: err });
  const handler = createHandler({ fetchImpl });
  const res = createFakeRes();
  await handler({ method: "GET", query: { chipUid: CHIP } }, res);
  assert.equal(res.statusCode, 504);
});

test("HEAD relays status without body", async () => {
  const fetchImpl = fakeFetch({
    status: 302,
    location: "https://meetcircuit.com/checkin/abc",
    body: "ignored",
  });
  const handler = createHandler({ fetchImpl });
  const res = createFakeRes();
  await handler({ method: "HEAD", query: { chipUid: CHIP } }, res);
  // 302 with Location relayed even on HEAD — previewer / monitor sees the
  // same shape as GET, no body
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers["Location"], "https://meetcircuit.com/checkin/abc");
  assert.equal(res.body, null);
});

test("HEAD on a non-redirect upstream returns the same status, no body", async () => {
  const fetchImpl = fakeFetch({ status: 403 });
  const handler = createHandler({ fetchImpl });
  const res = createFakeRes();
  await handler({ method: "HEAD", query: { chipUid: CHIP } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body, null);
  assert.equal(res.ended, true);
});

test("forwards user-agent and X-Forwarded-For headers to upstream", async () => {
  const fetchImpl = fakeFetch({ status: 302, location: "https://x.test/" });
  const handler = createHandler({ fetchImpl });
  const res = createFakeRes();
  await handler(
    {
      method: "GET",
      query: { chipUid: CHIP, picc_data: "x", cmac: "y" },
      headers: {
        "user-agent": "Mozilla/5.0 (iPhone)",
        "x-forwarded-for": "203.0.113.45",
      },
    },
    res,
  );
  const init = fetchImpl._calls[0].init;
  assert.equal(init.headers["user-agent"], "Mozilla/5.0 (iPhone)");
  assert.equal(init.headers["x-forwarded-for"], "203.0.113.45");
});
