import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 11, fontFamily: 'Helvetica', color: '#0f172a' },
  header: {
    backgroundColor: '#1e40af',
    color: '#ffffff',
    padding: 14,
    marginBottom: 16,
    borderRadius: 6,
  },
  headerLabel: { fontSize: 9, color: '#dbeafe', letterSpacing: 1, marginBottom: 4 },
  headerTitle: { fontSize: 18, fontWeight: 700, color: '#ffffff' },
  headerMeta: { fontSize: 10, color: '#dbeafe', marginTop: 4 },
  metaRow: { flexDirection: 'row', marginBottom: 4 },
  metaLabel: { width: 80, color: '#475569', fontWeight: 700 },
  metaValue: { flex: 1, color: '#0f172a' },
  section: { marginBottom: 14 },
  table: { marginTop: 8, borderTop: '1pt solid #e2e8f0' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottom: '1pt solid #e2e8f0',
    fontWeight: 700,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottom: '1pt solid #e2e8f0',
  },
  totalRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 4,
    backgroundColor: '#f8fafc',
    marginTop: 2,
  },
  col_part: { flex: 3 },
  col_source: { flex: 2 },
  col_qty: { width: 40, textAlign: 'center' },
  col_unit: { width: 70, textAlign: 'right' },
  col_total: { width: 80, textAlign: 'right' },
  partName: { fontWeight: 700 },
  partNumber: { fontFamily: 'Courier', fontSize: 9, color: '#64748b', marginTop: 1 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 9,
    color: '#94a3b8',
    textAlign: 'center',
    borderTop: '1pt solid #e2e8f0',
    paddingTop: 8,
  },
});

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

function RepairDocument({ repair }) {
  return (
    <Document
      title={`Repair ${repair.id} ${repair.location_name}`}
      author="Fuel Repairs"
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerLabel}>REPAIR REPORT</Text>
          <Text style={styles.headerTitle}>
            Repair #{repair.id} — {repair.location_name}
          </Text>
          <Text style={styles.headerMeta}>
            {repair.repair_date}
            {repair.pump_number ? ` · Pump ${repair.pump_number}` : ''}
            {repair.created_by_name ? ` · logged by ${repair.created_by_name}` : ''}
          </Text>
        </View>

        <View style={styles.section}>
          {repair.description ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Description</Text>
              <Text style={styles.metaValue}>{repair.description}</Text>
            </View>
          ) : null}
          {repair.notes ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Notes</Text>
              <Text style={styles.metaValue}>{repair.notes}</Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Status</Text>
            <Text style={styles.metaValue}>Closed</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.col_part}>Part</Text>
            <Text style={styles.col_source}>Source</Text>
            <Text style={styles.col_qty}>Qty</Text>
            <Text style={styles.col_unit}>Unit</Text>
            <Text style={styles.col_total}>Total</Text>
          </View>

          {repair.items.map((it, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={styles.col_part}>
                <Text style={styles.partName}>{it.item_name}</Text>
                {it.part_number ? (
                  <Text style={styles.partNumber}>{it.part_number}</Text>
                ) : null}
              </View>
              <Text style={styles.col_source}>{it.source_location_name}</Text>
              <Text style={styles.col_qty}>{it.quantity}</Text>
              <Text style={styles.col_unit}>{fmt(it.unit_cost)}</Text>
              <Text style={styles.col_total}>
                {fmt(Number(it.quantity) * Number(it.unit_cost))}
              </Text>
            </View>
          ))}

          <View style={styles.totalRow}>
            <Text style={styles.col_part}></Text>
            <Text style={styles.col_source}></Text>
            <Text style={styles.col_qty}></Text>
            <Text style={[styles.col_unit, { fontWeight: 700 }]}>Total</Text>
            <Text style={[styles.col_total, { fontWeight: 700, fontSize: 13 }]}>
              {fmt(repair.total_cost)}
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Generated automatically when repair #{repair.id} was closed.
          {' '}repairs.23fuels.com
        </Text>
      </Page>
    </Document>
  );
}

export async function renderRepairPdf(repair) {
  return await renderToBuffer(<RepairDocument repair={repair} />);
}
