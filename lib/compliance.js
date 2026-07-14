// Shared compliance-task helpers: status vs. today, and common site templates.
// A task's status is driven entirely by next_due_date. Marking it done rolls
// next_due_date forward by interval_months (in the API), so this stays simple.

export function complianceStatus(task) {
  const due = task && task.next_due_date;
  if (!due) return { level: 'none', dueDate: null, daysLeft: null };
  const t = Date.parse(due + 'T00:00:00');
  if (Number.isNaN(t)) return { level: 'none', dueDate: null, daysLeft: null };
  const days = Math.round((t - Date.now()) / 86400000);
  const level = days < 0 ? 'overdue' : days <= 30 ? 'soon' : 'ok';
  return { level, dueDate: due, daysLeft: days };
}

export function complianceDueLabel(s) {
  if (!s || s.daysLeft == null) return '';
  const d = s.daysLeft;
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return 'due today';
  if (d < 45) return `in ${d}d`;
  return `in ${Math.round(d / 30)} mo`;
}

export const COMPLIANCE_CATEGORIES = [
  'Fuel / UST',
  'Fire / Life-safety',
  'Weights & Measures',
  'Health / Food',
  'Environmental',
  'Building',
  'Other',
];

// Typical recurring compliance for a fuel + convenience site. Intervals are
// common estimates — confirm each against your jurisdiction / AHJ.
export const COMPLIANCE_TEMPLATES = [
  { label: 'Dispenser calibration (Weights & Measures)', category: 'Weights & Measures', interval_months: 12 },
  { label: 'Stage I vapor recovery test', category: 'Environmental', interval_months: 12 },
  { label: 'Underground tank monitor (ATG) certification', category: 'Fuel / UST', interval_months: 12 },
  { label: 'Line leak detector test', category: 'Fuel / UST', interval_months: 12 },
  { label: 'Cathodic protection test', category: 'Fuel / UST', interval_months: 36 },
  { label: 'UST monthly walkthrough inspection', category: 'Fuel / UST', interval_months: 1 },
  { label: 'Fire extinguisher inspection', category: 'Fire / Life-safety', interval_months: 12 },
  { label: 'Kitchen hood suppression service', category: 'Fire / Life-safety', interval_months: 6 },
  { label: 'Backflow preventer test', category: 'Building', interval_months: 12 },
  { label: 'Health / food-service inspection', category: 'Health / Food', interval_months: 12 },
];
