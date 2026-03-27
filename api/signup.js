const { Resend } = require("resend");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "Invalid email" });
  }

  const clean = email.trim().toLowerCase();

  try {
    // Write to Firestore (email as doc ID = dedup)
    await db.collection("signups").doc(clean).set({
      email: clean,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Send welcome email
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const resend = new Resend(resendKey);
      const from = process.env.RESEND_FROM || "Culture Club <onboarding@resend.dev>";
      await resend.emails.send({
        from,
        to: [clean],
        subject: "you're in.",
        html: renderWelcomeEmail(),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

function renderWelcomeEmail() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#000;">
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#fff;background:#000;max-width:480px;margin:0 auto;padding:48px 24px;">
<p style="margin:0 0 40px;font-size:18px;font-weight:600;letter-spacing:-0.02em;">Culture Club</p>
<p style="margin:0 0 24px;font-size:16px;line-height:1.6;">you're in.</p>
<p style="margin:0 0 40px;font-size:16px;line-height:1.6;color:#A0A0A0;">we'll be in touch before the first event.</p>
<div style="border-top:2px solid #FF4400;margin:40px 0 24px;"></div>
<p style="margin:0;font-size:12px;color:#A0A0A0;">Culture Club — <a href="https://cccircuit.com" style="color:#A0A0A0;text-decoration:underline;">cccircuit.com</a></p>
</div>
</body></html>`;
}
