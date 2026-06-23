// Helpers for reading a purchase invoice/receipt with Claude vision and turning
// it into structured line items. Reuses the shared client/model from equipmentAi.

export const INVOICE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    vendor: {
      type: 'string',
      description: 'The supplier / store the invoice is from. Empty string if not shown.',
    },
    invoice_date: {
      type: 'string',
      description:
        'The invoice or purchase date in YYYY-MM-DD format. Empty string if not determinable.',
    },
    line_items: {
      type: 'array',
      description: 'One entry per product/part purchased. Skip subtotal, tax, shipping, and total rows.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          description: { type: 'string', description: 'Item / part description as printed.' },
          part_number: { type: 'string', description: 'Part / SKU number if shown, else empty string.' },
          quantity: { type: 'number', description: 'Quantity purchased. Use 1 if not shown.' },
          unit_price: {
            type: 'number',
            description:
              'Price for ONE unit. If only an extended/line total is printed, divide it by the quantity.',
          },
        },
        required: ['description', 'part_number', 'quantity', 'unit_price'],
      },
    },
  },
  required: ['vendor', 'invoice_date', 'line_items'],
};

export const INVOICE_SYSTEM = `You read a purchase invoice or receipt for a convenience-store / fuel maintenance operation and extract it into structured data.
- Capture the vendor and the invoice/purchase date (as YYYY-MM-DD).
- List every physical product or part line. Do NOT include subtotal, sales tax, shipping/freight, fees, or grand-total rows as line items.
- unit_price is the price of a SINGLE unit. If the invoice only shows an extended line total, divide it by the quantity to get the unit price.
- Read numbers and part numbers exactly as printed; do not invent values. Leave a field as an empty string (or quantity 1) when it is genuinely not shown.`;

// Build the user content blocks: a document block for PDFs, an image block for photos.
export function buildInvoiceContent(fileUrl, isPdf) {
  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'url', url: fileUrl } }
    : { type: 'image', source: { type: 'url', url: fileUrl } };
  return [
    fileBlock,
    { type: 'text', text: 'Extract the vendor, date, and every product line item from this invoice.' },
  ];
}
