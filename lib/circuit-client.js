// Thin client for Circuit's organiser API (meetcircuit.com).
// The only call-site today is api/signup.js → upsertAudience. Add more
// methods here as we wire further surfaces.
//
// Failure handling lives in the call-site: this module just maps a successful
// 2xx response into the inner `data` payload, and throws on anything else.

function createCircuitClient({ baseUrl, token, fetchImpl = global.fetch }) {
  if (!baseUrl) throw new Error("circuit-client: baseUrl is required");
  if (!token) throw new Error("circuit-client: token is required");

  const trimmedBase = baseUrl.replace(/\/+$/, "");

  async function request(path, init = {}) {
    const url = `${trimmedBase}${path}`;
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    };
    const response = await fetchImpl(url, { ...init, headers });
    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // fall through; we'll throw below
      }
    }
    if (!response.ok) {
      const code = parsed?.code ? ` [${parsed.code}]` : "";
      const message = parsed?.error || `${response.status} ${response.statusText}`;
      throw new Error(`circuit ${path} failed${code}: ${message}`);
    }
    return parsed?.data ?? null;
  }

  return {
    async upsertAudience({ email, name, source }) {
      return request("/api/organiser/v1/audience/upsert", {
        method: "POST",
        body: JSON.stringify({
          email,
          ...(name ? { name } : {}),
          source: source || "circuitfm-signup",
        }),
      });
    },
  };
}

module.exports = { createCircuitClient };
