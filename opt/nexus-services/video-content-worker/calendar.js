function buildWeeklyCalendar(outputs, { startDateIso = new Date().toISOString(), days = 7, slotsPerDay = 2 } = {}) {
  const rows = Array.isArray(outputs) ? outputs : [];
  const calendar = [];
  const start = new Date(startDateIso);

  let cursor = 0;
  for (let day = 0; day < Math.max(1, days); day += 1) {
    for (let slot = 0; slot < Math.max(1, slotsPerDay); slot += 1) {
      if (cursor >= rows.length) break;

      const scheduled = new Date(start.getTime() + (day * 24 * 60 * 60 * 1000) + (slot * 6 * 60 * 60 * 1000));
      const row = rows[cursor];
      calendar.push({
        slot_id: `${day + 1}-${slot + 1}`,
        scheduled_at: scheduled.toISOString(),
        topic: row.topic,
        platform: row.platform,
        format: row.format,
        title: row.title,
        status: 'planned',
      });
      cursor += 1;
    }
  }

  return calendar;
}

module.exports = {
  buildWeeklyCalendar,
};
