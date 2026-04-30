// Apple App Site Association (AASA) for circuit.fm.
// Apple fetches this once on app install + on associated-domains updates
// to learn which paths the iOS app + App Clip handle on this domain.
//
// Served at https://circuit.fm/.well-known/apple-app-site-association
// via the Vercel rewrite in vercel.json. Apple requires:
//   - URL: /.well-known/apple-app-site-association (no extension)
//   - Status: 200
//   - Content-Type: application/json
//   - No redirects in the response
//
// Mirror this shape with the meetcircuit.com AASA — appIDs and component
// patterns must match so iOS treats the two hosts as equivalent for
// universal-link + App Clip dispatch.

const AASA = {
  applinks: {
    details: [
      {
        appIDs: ["P2FGGF5JJG.com.meetcircuit.guest"],
        components: [
          {
            "/": "/b/*",
            comment:
              "Block-tap URL — opens the full Circuit app when installed",
          },
        ],
      },
    ],
  },
  appclips: {
    apps: ["P2FGGF5JJG.com.meetcircuit.guest.Clip"],
  },
};

function createHandler() {
  return function handler(req, res) {
    // Apple fetches with GET. HEAD is harmless to allow for monitoring.
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      res.status(405);
      return res.end();
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=300");

    if (req.method === "HEAD") {
      res.status(200);
      return res.end();
    }

    res.status(200);
    return res.send(JSON.stringify(AASA));
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.AASA = AASA;
