function asText(value) {
  return String(value || '').trim();
}

function makeHooks(topic, title) {
  return [
    `Most people miss this about ${topic.replace(/_/g, ' ')}.` ,
    `If ${topic.replace(/_/g, ' ')} is confusing, start here.`,
    `${title} in under 60 seconds.`,
  ];
}

function makeCaptions(topic) {
  return [
    `${topic.replace(/_/g, ' ')} explained simply. Educational only.`,
    `Actionable checklist for ${topic.replace(/_/g, ' ')}.`,
    `Save this for your next review cycle.`,
  ];
}

function makeCtas(audience) {
  return [
    'Comment "CHECKLIST" for the step-by-step summary.',
    'Follow for more educational breakdowns and templates.',
    `Share this with a ${audience.replace(/_/g, ' ')} who needs it.`,
  ];
}

function makeOutline(topic, evidence) {
  return [
    {
      scene: 1,
      goal: 'hook',
      voiceover: `Today we are breaking down ${topic.replace(/_/g, ' ')} in plain language.`,
      broll_hint: 'Animated checklist intro',
    },
    {
      scene: 2,
      goal: 'core_teach',
      voiceover: `Start with this key point: ${asText(evidence[0] || 'use a documented, repeatable process')}.`,
      broll_hint: 'Screen recording with key highlights',
    },
    {
      scene: 3,
      goal: 'cta',
      voiceover: 'Use this as an educational checklist and verify details before action.',
      broll_hint: 'End card with CTA text',
    },
  ];
}

function generateContentPack({
  topic,
  title,
  platform,
  format,
  tone,
  audience,
  evidence = [],
  traceId,
}) {
  const hooks = makeHooks(topic, title);
  const captions = makeCaptions(topic);
  const ctas = makeCtas(audience);
  const outline = makeOutline(topic, evidence);

  const summary = `${title} (${platform}/${format}) draft generated from Nexus research evidence.`;

  return {
    title,
    topic,
    platform,
    format,
    tone,
    audience,
    trace_id: traceId,
    summary,
    script: [
      hooks[0],
      `Main teaching point: ${asText(evidence[0] || 'No direct evidence available; treat as draft and review.')}`,
      `Tone target: ${tone}.`,
      ctas[0],
    ].join(' '),
    outline,
    hooks,
    captions,
    thumbnail_text: [
      `${topic.replace(/_/g, ' ').slice(0, 42)}`,
      'Checklist Breakdown',
      'Avoid Common Mistakes',
    ],
    cta_variants: ctas,
    evidence_summary: evidence.slice(0, 5),
    risk_notes: ['Educational only. Verify all claims before publication.'],
    key_points: [
      `topic:${topic}`,
      `platform:${platform}`,
      `format:${format}`,
      `tone:${tone}`,
      `status:draft`,
    ],
    tags: [
      'video_content',
      'draft',
      topic,
      platform,
      format,
    ],
    confidence: 0.72,
    source_url: `nexus://video-content/${traceId}/${topic}`,
  };
}

module.exports = {
  generateContentPack,
};
