const { renderShortlist, renderWildcard, renderConfirmation } = require("../lib/templates");

const templates = {
  shortlist: renderShortlist,
  wildcard: renderWildcard,
  confirmation: renderConfirmation,
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.BROADCAST_SECRET;
  const auth = req.headers.authorization;
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { template, data } = req.body || {};
  const renderFn = templates[template];
  if (!renderFn) {
    return res.status(400).json({ error: `Unknown template: ${template}` });
  }

  const html = template === "confirmation" ? renderFn() : renderFn(data);
  return res.status(200).json({ html });
};
