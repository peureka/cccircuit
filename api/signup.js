const { Resend } = require("resend");
const admin = require("firebase-admin");
const { renderConfirmation } = require("../lib/templates");

function createHandler({ db, resend, segmentId, from, timestamp }) {
  return async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = req.body || {};
    const { email, name, voucher_id } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Invalid email" });
    }

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Invalid name" });
      }
    }

    // voucher_id is optional. Must be a string if present. Empty string is
    // treated as "no voucher" (handles missing ?v= query param on the client).
    if (voucher_id !== undefined && typeof voucher_id !== "string") {
      return res.status(400).json({ error: "Invalid voucher_id" });
    }

    const clean = email.trim().toLowerCase();
    const cleanName = typeof name === "string" ? name.trim() : null;
    const cleanVoucher =
      typeof voucher_id === "string" && voucher_id.trim().length > 0
        ? voucher_id.trim()
        : null;

    try {
      const docData = {
        email: clean,
        created_at: timestamp(),
      };
      if (cleanName) docData.name = cleanName;

      await db
        .collection("signups")
        .doc(clean)
        .set(docData, { merge: true });

      // If this signup was vouched via a card tap, record the vouch.
      // Deterministic doc ID dedups repeat signups from the same voucher
      // for the same recipient; created_at is preserved on the original.
      if (cleanVoucher) {
        const vouchId = `${cleanVoucher}__${clean}`;
        const vouchRef = db.collection("vouches").doc(vouchId);
        const existing = await vouchRef.get();
        if (!existing.exists) {
          await vouchRef.set({
            from_member_id: cleanVoucher,
            recipient_email: clean,
            status: "tapped",
            created_at: timestamp(),
          });
        }
      }

      let duplicate = false;
      if (resend && segmentId) {
        try {
          await resend.contacts.create({
            email: clean,
            segments: [{ id: segmentId }],
          });
        } catch (contactErr) {
          if (
            contactErr.statusCode === 409 ||
            (contactErr.message && contactErr.message.includes("already"))
          ) {
            duplicate = true;
          } else {
            console.error("Resend contact error:", contactErr);
          }
        }

        if (!duplicate) {
          resend.emails
            .send({
              from,
              to: [clean],
              subject: "you're on the list.",
              html: renderConfirmation(),
            })
            .catch((err) => console.error("Confirmation email error:", err));
        }
      }

      return res.status(200).json({ ok: true, duplicate });
    } catch (err) {
      console.error("Signup error:", err);
      return res.status(500).json({ error: "Something went wrong" });
    }
  };
}

// Production handler: lazy-initialize Firebase + Resend on first invocation so
// that `require('./api/signup')` works in tests without env vars set.
let cachedProdHandler = null;

function defaultHandler(req, res) {
  if (!cachedProdHandler) {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    const resendKey = process.env.RESEND_API_KEY;
    cachedProdHandler = createHandler({
      db: admin.firestore(),
      resend: resendKey ? new Resend(resendKey) : null,
      segmentId: process.env.RESEND_SEGMENT_ID,
      from:
        process.env.RESEND_FROM || "Culture Club <onboarding@resend.dev>",
      timestamp: () => admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return cachedProdHandler(req, res);
}

module.exports = defaultHandler;
module.exports.createHandler = createHandler;
