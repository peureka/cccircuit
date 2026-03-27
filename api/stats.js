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
    // Total signups
    const totalSnap = await db.collection("signups").count().get();
    const signupCount = totalSnap.data().count;

    // Signups this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekSnap = await db
      .collection("signups")
      .where("created_at", ">=", admin.firestore.Timestamp.fromDate(weekAgo))
      .count()
      .get();
    const weeklySignups = weekSnap.data().count;

    // Last broadcast
    let lastBroadcast = null;
    const broadcastSnap = await db
      .collection("broadcasts")
      .orderBy("sentAt", "desc")
      .limit(1)
      .get();
    if (!broadcastSnap.empty) {
      const doc = broadcastSnap.docs[0].data();
      lastBroadcast = {
        subject: doc.subject,
        template: doc.template,
        sentAt: doc.sentAt ? doc.sentAt.toDate().toISOString() : null,
      };
    }

    // Total broadcasts
    const broadcastCountSnap = await db
      .collection("broadcasts")
      .count()
      .get();
    const broadcastCount = broadcastCountSnap.data().count;

    return res.status(200).json({
      signupCount,
      weeklySignups,
      broadcastCount,
      lastBroadcast,
    });
  } catch (err) {
    console.error("Stats error:", err);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
};
