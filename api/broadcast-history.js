const admin = require("firebase-admin");

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.BROADCAST_SECRET;
  const auth = req.headers.authorization;
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const snapshot = await db
      .collection("broadcasts")
      .orderBy("sentAt", "desc")
      .limit(50)
      .get();

    const broadcasts = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        subject: d.subject,
        template: d.template,
        sentAt: d.sentAt ? d.sentAt.toDate().toISOString() : null,
      };
    });

    return res.status(200).json({ broadcasts });
  } catch (err) {
    console.error("Broadcast history error:", err);
    return res.status(500).json({ error: "Failed to fetch history" });
  }
};
