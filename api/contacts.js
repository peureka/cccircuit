const admin = require("firebase-admin");

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = async function handler(req, res) {
  const secret = process.env.BROADCAST_SECRET;
  const auth = req.headers.authorization;
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const snapshot = await db
      .collection("signups")
      .orderBy("created_at", "desc")
      .get();

    const contacts = snapshot.docs.map((doc) => ({
      email: doc.id,
      created_at: doc.data().created_at
        ? doc.data().created_at.toDate().toISOString()
        : null,
    }));

    return res.status(200).json({ contacts });
  } catch (err) {
    console.error("Contacts error:", err);
    return res.status(500).json({ error: "Failed to fetch contacts" });
  }
};
