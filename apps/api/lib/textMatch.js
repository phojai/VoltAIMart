/* ============================================================
   VoltAIMart — typo tolerance & synonym matching for search.
   Pure JS, no external deps — the catalog is small enough that
   in-memory Levenshtein/fuzzy scoring comfortably beats a 200ms
   budget. Independent of lib/catalogSearch.js (used by AI chat's
   search_catalog tool) so this never touches that behavior.
   ============================================================ */

// Built-in synonym groups — each group is a set of interchangeable terms.
// Expanded both ways (mobile <-> smartphone), per the spec's examples plus
// a few tuned to VoltAIMart's actual catalog vocabulary.
// Every entry is a single word — a multi-word phrase would decompose into
// its individual words when paired (see buildSynonymIndex), and a generic
// word like "smart" turning into a synonym of "tv" (from a one-time "smart
// tv" entry) would then falsely match anything with "smart" in its name.
const SYNONYM_GROUPS = [
  ["mobile", "smartphone", "phone", "cellphone"],
  ["tv", "television"],
  ["shoes", "sneakers", "trainers", "footwear"],
  ["earbuds", "earphones", "buds"],
  ["laptop", "notebook"],
  ["headphones", "headphone", "cans"],
  ["speaker", "speakers"],
  ["watch", "smartwatch"],
  ["tablet", "ipad"],
  ["controller", "gamepad"],
  ["tee", "tshirt", "shirt"],
  ["jacket", "outerwear"],
  ["trousers", "pants"],
  ["bag", "tote", "duffel", "backpack"],
  ["camera", "cam"],
  ["boots", "boot"],
];

function buildSynonymIndex(customSynonyms){
  const index = new Map();
  const addOneWay = (from, to) => {
    if (!index.has(from)) index.set(from, new Set());
    index.get(from).add(to);
  };
  // Both `a` and `b` are tokenized so a multi-word synonym ("cell phone")
  // decomposes into per-word associations — every downstream consumer works
  // on single-word tokens, so a synonym target must be one too.
  const addPair = (a, b) => {
    const aWords = tokenize(a);
    const bWords = tokenize(b);
    for (const aw of aWords) for (const bw of bWords) if (aw !== bw) addOneWay(aw, bw);
  };
  for (const group of SYNONYM_GROUPS){
    for (const term of group){
      for (const other of group){
        if (other !== term) addPair(term, other);
      }
    }
  }
  // Admin-added overrides: { "raw term": "canonical term" } — expand both ways.
  for (const [raw, canonical] of Object.entries(customSynonyms || {})){
    addPair(raw, canonical);
    addPair(canonical, raw);
  }
  return index;
}

function tokenize(str){
  return String(str || "")
    .toLowerCase()
    .split(/[^a-z0-9₹]+/i)
    .filter(Boolean);
}

/** Expands a token list with any known synonyms, de-duplicated. */
function expandSynonyms(tokens, synonymIndex){
  const expanded = new Set(tokens);
  for (const t of tokens){
    const syns = synonymIndex.get(t);
    if (syns) for (const s of syns) expanded.add(s);
  }
  return Array.from(expanded);
}

function levenshtein(a, b){
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++){
    curr[0] = i;
    for (let j = 1; j <= bl; j++){
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

/** Edit-distance tolerance scales with word length — short words need an exact/near-exact match. */
function toleranceFor(len){
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  return 2;
}

/**
 * Finds the closest vocabulary word to `token` within an adaptive edit-distance
 * budget. Returns { word, distance } or null if nothing is close enough.
 */
function correctToken(token, vocabulary){
  if (vocabulary.has(token)) return null; // already a real word — no correction needed
  const budget = toleranceFor(token.length);
  if (budget === 0) return null;
  let best = null;
  for (const word of vocabulary){
    if (Math.abs(word.length - token.length) > budget) continue;
    const dist = levenshtein(token, word);
    if (dist <= budget && (!best || dist < best.distance)){
      best = { word, distance: dist };
      if (dist === 1) break; // good enough, stop scanning
    }
  }
  return best;
}

/** Builds the set of known words from the current catalog (names, categories, keywords, brand). */
function buildVocabulary(db){
  const vocab = new Set();
  for (const p of db.products){
    for (const w of tokenize(p.name)) vocab.add(w);
    for (const w of tokenize(p.category)) vocab.add(w);
    for (const w of tokenize(p.brand || "")) vocab.add(w);
    for (const kw of p.keywords || []){
      for (const w of tokenize(kw)) vocab.add(w);
    }
  }
  for (const c of db.categories) for (const w of tokenize(c.label)) vocab.add(w);
  for (const group of SYNONYM_GROUPS) for (const term of group) for (const w of tokenize(term)) vocab.add(w);
  return vocab;
}

/**
 * Runs typo correction + synonym expansion over a raw query.
 * Returns { tokens, expandedTokens, corrected, correctedQuery, hasTypo }.
 */
function normalizeQuery(query, db, synonymIndex){
  const rawTokens = tokenize(query);
  const vocabulary = buildVocabulary(db);
  let hasTypo = false;
  const correctedTokens = rawTokens.map(t => {
    // Very short "words" (sizes, numbers) are left alone.
    if (t.length <= 2) return t;
    const fix = correctToken(t, vocabulary);
    if (fix){ hasTypo = true; return fix.word; }
    return t;
  });
  const expandedTokens = expandSynonyms(correctedTokens, synonymIndex);
  const correctedSet = new Set(correctedTokens);
  const synonymTokens = expandedTokens.filter(t => !correctedSet.has(t));
  return {
    tokens: rawTokens,
    correctedTokens,
    synonymTokens,
    expandedTokens,
    correctedQuery: correctedTokens.join(" "),
    hasTypo,
  };
}

module.exports = {
  tokenize,
  levenshtein,
  buildSynonymIndex,
  expandSynonyms,
  buildVocabulary,
  correctToken,
  normalizeQuery,
};
