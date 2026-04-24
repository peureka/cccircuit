// Admin: pre-register a batch of chipUids as "unassigned" cards. Run this
// once when you've programmed a fresh batch of NFC cards with NFC Tools,
// so the admin panel knows the cards exist (and can show them as stock
// available for handover).
//
// Idempotent: chipUids that already exist as card docs are skipped, never
// overwritten. This makes re-running safe.
//
// Auth: Bearer BROADCAST_SECRET.

const admin = require("firebase-admin");

function createHandler({ db, adminSecret, timestamp }) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const auth = req.headers && req.headers.authorization;
    if (!adminSecret || auth !== `Bearer ${adminSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const body = req.body || {};
    const { chipUids } = body;

    if (!Array.isArray(chipUids) || chipUids.length === 0) {
      return res
        .status(400)
        .json({ error: "chipUids must be a non-empty array" });
    }

    // Trim, drop empties, dedup. Preserve order for predictable output.
    const seen = new Set();
    const cleaned = [];
    for (const raw of chipUids) {
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (trimmed.length === 0 || trimmed.length > 128) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      cleaned.push(trimmed);
    }

    if (cleaned.length === 0) {
      return res.status(400).json({ error: "no valid chipUids provided" });
    }

    let created = 0;
    let skipped = 0;
    const errors = [];

    for (const chipUid of cleaned) {
      try {
        const ref = db.collection("cards").doc(chipUid);
        const existing = await ref.get();
        if (existing.exists) {
          skipped++;
          continue;
        }
        await ref.set({
          status: "unassigned",
          member_id: null,
          created_at: timestamp(),
        });
        created++;
      } catch (err) {
        console.error(`Provision ${chipUid} failed:`, err);
        errors.push({ chipUid, error: err.message });
      }
    }

    return res.status(200).json({
      created,
      skipped,
      failed: errors.length,
      errors: errors.length ? errors : undefined,
    });
  };
}

// Production handler: lazy-init Firebase.
let cachedProdHandler = null;
function defaultHandler(req, res) {
  if (!cachedProdHandler) {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    cachedProdHandler = createHandler({
      db: admin.firestore(),
      adminSecret: process.env.BROADCAST_SECRET,
      timestamp: () => admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
