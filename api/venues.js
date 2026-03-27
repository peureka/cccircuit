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

  const col = db.collection("venues");

  if (req.method === "GET") {
    const snapshot = await col.orderBy("name").get();
    const venues = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json({ venues });
  }

  if (req.method === "POST") {
    const { name, neighbourhood, format, contact, notes } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });
    const doc = await col.add({
      name,
      neighbourhood: neighbourhood || "",
      format: format || "",
      contact: contact || "",
      notes: notes || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.status(200).json({ ok: true, id: doc.id });
  }

  if (req.method === "PUT") {
    const { id, ...fields } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    await col.doc(id).update(fields);
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    await col.doc(id).delete();
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
};
