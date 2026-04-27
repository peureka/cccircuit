// Block-tap proxy for circuit.fm.
//
// PR #39 on circuit/ added circuit.fm to the iOS app's associated domains
// (applinks: + appclips:). Chips encoded with circuit.fm/b/<uid> URLs land
// here. We forward to meetcircuit.com/b/<uid> server-side so the SDM
// (Secure Dynamic Messaging, NTAG 424 DNA) HMAC verify stays single-sourced
// in the circuit/ repo. Single source of truth for the crypto matters more
// than the ~150ms extra hop at venue ingress.
//
// Two paths land here:
//
//   1. iOS browser (no app installed): user follows circuit.fm/b/<uid>
//      with picc_data + cmac in the query string. We proxy to meetcircuit
//      and relay its redirect (or 4xx) to the user.
//
//   2. App Clip already-launched flow: when the iOS App Clip handles the
//      universal link, it has its own SDM verify path via /api/clip/check-in.
//      The browser request at /b/<uid> is a fallback for users who never
//      installed the app. The App Clip flow doesn't depend on what we
//      return here.

const UPSTREAM_HOST = process.env.CIRCUIT_BASE_URL || "https://meetcircuit.com";

function isFetchTimeout(err) {
  return (
    err &&
    (err.name === "AbortError" ||
      (err.cause && err.cause.code === "UND_ERR_HEADERS_TIMEOUT"))
  );
}

function createHandler({ fetchImpl = global.fetch, upstreamHost = UPSTREAM_HOST } = {}) {
  return async function handler(req, res) {
    const isHead = req.method === "HEAD";
    if (req.method !== "GET" && !isHead) {
      res.setHeader("Allow", "GET, HEAD");
      res.status(405);
      return res.end();
    }

    const chipUid = req.query && req.query.chipUid;
    if (!chipUid || typeof chipUid !== "string") {
      res.status(400);
      return res.end();
    }

    // Build upstream URL preserving every query param except the routing one
    // ("chipUid" is a Vercel-injected route parameter, not part of what
    // meetcircuit.com expects).
    const upstreamUrl = new URL(
      `${upstreamHost.replace(/\/+$/, "")}/b/${encodeURIComponent(chipUid)}`,
    );
    if (req.query) {
      for (const [k, v] of Object.entries(req.query)) {
        if (k === "chipUid") continue;
        if (typeof v === "string") upstreamUrl.searchParams.set(k, v);
      }
    }

    let upstream;
    try {
      upstream = await fetchImpl(upstreamUrl.toString(), {
        method: req.method,
        // We want to read the redirect target, not follow it — the browser
        // does the second hop. Manual mode preserves the Location header.
        redirect: "manual",
        // Forward IP for upstream rate-limit / audit. X-Forwarded-For from
        // Vercel's edge already carries the client IP; pass it through.
        headers: {
          ...(req.headers && req.headers["user-agent"]
            ? { "user-agent": req.headers["user-agent"] }
            : {}),
          ...(req.headers && req.headers["x-forwarded-for"]
            ? { "x-forwarded-for": req.headers["x-forwarded-for"] }
            : {}),
        },
      });
    } catch (err) {
      console.error("b-proxy upstream fetch failed:", err && err.message);
      res.status(isFetchTimeout(err) ? 504 : 503);
      return res.end();
    }

    // Status 3xx with a Location header → relay the redirect.
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (location) {
        res.setHeader("Location", location);
        res.setHeader("Cache-Control", "no-store");
        res.status(upstream.status);
        return res.end();
      }
      // 3xx without a Location — fall through and relay status with no body.
    }

    // Non-redirect: relay status. Body relayed only on GET.
    res.status(upstream.status);
    if (isHead) return res.end();

    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    const body = await upstream.text();
    return res.send(body);
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
