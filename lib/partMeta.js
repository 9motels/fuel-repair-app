// Part pipeline statuses + labels. Plain constants with no SDK imports, so
// client pages can use them without shipping the Anthropic SDK to the browser.
export const PART_STATUSES = ['needs_research', 'ready_to_order', 'ordered', 'received', 'installed', 'cancelled'];

export const PART_STATUS_LABEL = {
  needs_research: 'Needs research',
  ready_to_order: 'Ready to order',
  ordered: 'Ordered',
  received: 'Received — awaiting install',
  installed: 'Installed',
  cancelled: 'Cancelled',
};

// Open = still needs attention (not resolved).
export const PART_OPEN_STATUSES = ['needs_research', 'ready_to_order', 'ordered', 'received'];

// Which timestamp a status move stamps (first time only).
export const PART_STATUS_TIMESTAMP = { ordered: 'ordered_at', received: 'received_at', installed: 'installed_at' };
