// Banned language patterns for Circuit FM's factual-mirror tone.
// Mirrors the meetcircuit baseline at
// `circuit/src/lib/ai/banned-patterns.ts`, plus FM-specific additions
// (membership tier names) per CIRCUIT_FM_DESIGN_BRIEF.md §B.6.
//
// Used by `test/professional-tone-audit.test.js` as a CI gate on
// member-facing surfaces (the homepage, the release form, the
// manifesto, and the user-rendered HTML emitted by `/api/u/<token>`
// and `/api/c/<chipUid>`).
//
// The discipline is anti-hype, not anti-noun. Members are allowed
// ("members' club"). Tier *names* are not.

const BANNED_PATTERNS = [
  // Gamification
  /\bbadges?\b/i,
  // Plural-only on FM. Singular "point" is rarely gamification —
  // "the room is the point" is FM-canonical voice (manifesto), where
  // "earn points" is gamification register. The meetcircuit baseline
  // uses `\bpoints?\b` and accepts the false-positive risk because
  // its surfaces don't use "point" as a noun. FM does. Diverged.
  //
  // Also exempts the verb forms "points to / points at / points
  // toward" — these are referent-of usage, not gamification. Surfaces
  // in this codebase: "your past attendance no longer points to you"
  // (account anonymisation copy on the iOS Settings screen).
  /\bpoints\b(?!\s+(of|to|at|toward))/i,
  /\bscores?\b/i,
  /\blevel\s*up/i,
  /\bleveled\s*up/i,
  /\bachiev/i,
  /\brewards?\b/i,
  /\bleaderboard/i,
  /\btier/i,
  /\bunlock/i,
  // Urgency / FOMO
  /\bdon[''’]?t miss/i,
  /\bhurry/i,
  /\blimited\b/i,
  /\bexclusive\b/i,
  /\blast chance/i,
  // Superlatives / cheerleading
  /\bamazing/i,
  /\bincredible/i,
  /\bsuperstar/i,
  /\bawesome/i,
  /\bfantastic/i,
  /\bcongrat/i,
  /\bwell done/i,
  /\bkeep it up/i,
  /\bway to go/i,
  /\bimpressive/i,
  /\bwow\b/i,
  // Streak maintenance
  /\bkeep.*streak/i,
  /\bdon[''’]?t break/i,
  // Game mechanics
  /\bchallenge/i,
  /\bquest\b/i,
  /\bmission/i,
  // Comparison
  /\btop \d+%/i,
  /\bmore than most/i,
  /\bahead of/i,

  // FM-specific — Circuit FM has internal tiers (Queue / Floor /
  // Regulars / Circuit / Key). Per CIRCUIT_FM_DESIGN_BRIEF.md §B.6,
  // none of these names appear on member-facing surfaces. "Floor" is
  // too generic to ban literally (collides with "floor plan", "shop
  // floor"), so we ban only the unambiguously-tier strings:
  /\bcore member/i,
  /\bregulars\b/i,
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace allowed substrings with zero-width spaces so they don't
 * trigger banned-pattern checks. Used when an organiser display name
 * happens to contain a banned word ("The Amazing Supper Club").
 */
function maskAllowed(text, allowedSubstrings) {
  if (!allowedSubstrings || allowedSubstrings.length === 0) return text;
  let masked = text;
  for (const sub of allowedSubstrings) {
    if (!sub) continue;
    masked = masked.replace(
      new RegExp(escapeRegExp(sub), "gi"),
      "​".repeat(sub.length),
    );
  }
  return masked;
}

function findBannedMatch(text, options = {}) {
  const check = maskAllowed(text, options.allowedSubstrings);
  for (const re of BANNED_PATTERNS) {
    const m = re.exec(check);
    if (m) return { pattern: re.source, match: m[0] };
  }
  return null;
}

function validateTone(text, options = {}) {
  return findBannedMatch(text, options) === null;
}

module.exports = {
  BANNED_PATTERNS,
  findBannedMatch,
  validateTone,
};
