// Pure helpers for computing a service reminder's next-due + urgency.

const DAY = 86400000;
const SOON_MILES = 500; // within 500 mi -> "due soon"
const SOON_DAYS = 14; // within 14 days -> "due soon"

function addMonths(dateStr, months) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d;
}

// Given a reminder row and the vehicle's current odometer, return urgency level
// + how much is left by miles and/or by date (whichever the reminder tracks).
export function reminderStatus(rem, currentOdometer) {
  const odo = Number(currentOdometer) || 0;
  let milesLeft = null;
  let daysLeft = null;
  let dueOdometer = null;
  let dueDate = null;

  if (rem.interval_miles && rem.last_done_odometer != null) {
    dueOdometer = Number(rem.last_done_odometer) + Number(rem.interval_miles);
    milesLeft = dueOdometer - odo;
  }
  if (rem.interval_months && rem.last_done_date) {
    dueDate = addMonths(rem.last_done_date, Number(rem.interval_months));
    const todayStr = new Date().toISOString().slice(0, 10);
    daysLeft = Math.round((dueDate.getTime() - new Date(`${todayStr}T00:00:00`).getTime()) / DAY);
  }

  const overdue = (milesLeft != null && milesLeft <= 0) || (daysLeft != null && daysLeft <= 0);
  const soon =
    !overdue &&
    ((milesLeft != null && milesLeft <= SOON_MILES) || (daysLeft != null && daysLeft <= SOON_DAYS));
  const level = overdue ? "overdue" : soon ? "soon" : milesLeft == null && daysLeft == null ? "none" : "ok";

  return { level, milesLeft, daysLeft, dueOdometer, dueDate };
}

// Short human label for the due state, e.g. "in 1,200 mi", "300 mi over · 5 days over".
export function reminderDueLabel(s) {
  const parts = [];
  if (s.milesLeft != null) {
    parts.push(s.milesLeft <= 0 ? `${Math.abs(s.milesLeft).toLocaleString()} mi over` : `in ${s.milesLeft.toLocaleString()} mi`);
  }
  if (s.daysLeft != null) {
    parts.push(s.daysLeft <= 0 ? `${Math.abs(s.daysLeft)} days over` : `in ${s.daysLeft} days`);
  }
  if (parts.length === 0) return "no interval set";
  return parts.join(" · ");
}

// "every 5,000 mi / 6 mo" style label for the interval itself.
export function intervalLabel(rem) {
  const parts = [];
  if (rem.interval_miles) parts.push(`${Number(rem.interval_miles).toLocaleString()} mi`);
  if (rem.interval_months) parts.push(`${rem.interval_months} mo`);
  return parts.length ? `every ${parts.join(" / ")}` : "no interval";
}
