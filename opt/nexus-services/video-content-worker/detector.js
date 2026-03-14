function asText(value) {
  return String(value || '').trim();
}

function clip(text, max = 180) {
  const value = asText(text);
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function buildSeedCandidates(context) {
  const out = [];

  for (const cluster of context.clusters || []) {
    const name = asText(cluster.cluster_name || cluster.name || 'cluster_topic');
    if (!name) continue;
    out.push({
      topic: name.toLowerCase().replace(/\s+/g, '_'),
      title: clip(cluster.summary || name, 120),
      evidence: [clip(cluster.summary || name, 240)],
      source_type: 'cluster',
      score: Number(cluster.score || 65),
      urgency: 'medium',
    });
  }

  for (const gap of context.gaps || []) {
    const topic = asText(gap.topic || 'coverage_gap');
    out.push({
      topic: topic.toLowerCase().replace(/\s+/g, '_'),
      title: `Service gap: ${clip(topic, 90)}`,
      evidence: [clip(gap.gap_summary || topic, 240)],
      source_type: 'coverage_gap',
      score: 80,
      urgency: asText(gap.urgency || 'high').toLowerCase(),
    });
  }

  for (const opp of context.opportunities || []) {
    const title = asText(opp.title || opp.niche || 'business_opportunity');
    out.push({
      topic: title.toLowerCase().replace(/\s+/g, '_'),
      title: clip(title, 120),
      evidence: [clip(opp.summary || opp.niche || title, 240)],
      source_type: 'business_opportunity',
      score: Number(opp.score || 75),
      urgency: asText(opp.urgency || 'medium').toLowerCase(),
    });
  }

  if (out.length === 0) {
    out.push({
      topic: 'credit_education_basics',
      title: 'Credit education basics and workflow mistakes to avoid',
      evidence: ['Fallback topic from transcript-first mode.'],
      source_type: 'fallback',
      score: 50,
      urgency: 'low',
    });
  }

  return out;
}

function dedupeAndRank(candidates, maxTopics = 10) {
  const byTopic = new Map();

  for (const candidate of candidates) {
    const key = asText(candidate.topic).toLowerCase();
    if (!key) continue;

    const existing = byTopic.get(key);
    if (!existing || Number(candidate.score || 0) > Number(existing.score || 0)) {
      byTopic.set(key, candidate);
    }
  }

  return Array.from(byTopic.values())
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, Math.max(1, maxTopics));
}

function detectTopics(context, { maxTopics = 10 } = {}) {
  const candidates = buildSeedCandidates(context);
  return dedupeAndRank(candidates, maxTopics);
}

module.exports = {
  detectTopics,
};
