const STOPLIST = new Set([
  'change', 'service', 'serviced', 'replace', 'replaced', 'check', 'checked',
  'inspect', 'inspection', 'clean', 'cleaned', 'repair', 'repaired', 'new',
  'and', 'the', 'of', 'for', 'a', 'an', 'with', 'to',
]);

function tokenize(text) {
  const tokens = new Set();
  for (let raw of String(text || '').toLowerCase().split(/[^a-z]+/)) {
    if (!raw) continue;
    if (STOPLIST.has(raw)) continue;
    if (raw.length > 3 && raw.endsWith('s')) raw = raw.slice(0, -1);
    tokens.add(raw);
  }
  return tokens;
}

export function matchesReminder(logText, reminderLabel) {
  const a = tokenize(logText);
  const b = tokenize(reminderLabel);
  for (const token of a) {
    if (token.length >= 3 && b.has(token)) return true;
  }
  return false;
}
