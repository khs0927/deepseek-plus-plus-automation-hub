/**
 * Vector Retriever for Precedents and MoLIT Q&As
 */
const seedData = require("./precedents_seed.json");

async function retrieveRelevantPrecedents(query, topK = 3) {
  const words = query.split(/\s+/);
  const scored = seedData.map(item => {
    let matchCount = 0;
    words.forEach(w => {
      if (item.title.includes(w) || item.content.includes(w)) matchCount++;
    });
    const score = (matchCount + 1) / (words.length + 5);
    return { ...item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

module.exports = { retrieveRelevantPrecedents };
