// Job statuses/priorities + labels. Plain constants with no SDK imports, so
// client pages can use them without shipping the Anthropic SDK to the browser.
export const JOB_STATUSES = ['new', 'scheduled', 'waiting_parts', 'waiting_contractor', 'completed'];
export const JOB_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export const STATUS_LABEL = {
  new: 'New',
  scheduled: 'Scheduled',
  waiting_parts: 'Waiting for Parts',
  waiting_contractor: 'Waiting for Contractor',
  completed: 'Completed',
};

export const PRIORITY_LABEL = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
