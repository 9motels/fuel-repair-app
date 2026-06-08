import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica', color: '#0f172a' },
  header: { backgroundColor: '#1e40af', color: '#ffffff', padding: 14, marginBottom: 14, borderRadius: 6 },
  headerLabel: { fontSize: 9, color: '#dbeafe', letterSpacing: 1, marginBottom: 4 },
  headerTitle: { fontSize: 18, fontWeight: 700, color: '#ffffff' },
  headerMeta: { fontSize: 10, color: '#dbeafe', marginTop: 4 },
  cardsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  card: { flex: 1, border: '1pt solid #e2e8f0', borderRadius: 6, padding: 10 },
  cardLabel: { fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 },
  cardValue: { fontSize: 16, fontWeight: 700, marginTop: 4 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginTop: 14, marginBottom: 6, color: '#0f172a' },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#f1f5f9',
    paddingVertical: 5, paddingHorizontal: 4,
    borderBottom: '1pt solid #e2e8f0', fontWeight: 700, fontSize: 9,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5, paddingHorizontal: 4,
    borderBottom: '1pt solid #e2e8f0',
  },
  cellText: { flex: 1 },
  cellNum: { width: 60, textAlign: 'right' },
  cellCenter: { width: 50, textAlign: 'center' },
  cellTextSm: { flex: 2 },
  partNum: { fontFamily: 'Courier', fontSize: 9, color: '#64748b' },
  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, fontSize: 9, color: '#94a3b8', textAlign: 'center', borderTop: '1pt solid #e2e8f0', paddingTop: 6 },
});

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

function ReportDocument({ data, generatedAt }) {
  const { totals, by_location, top_parts, by_pump, by_month, filters } = data;
  return (
    <Document title={`Fuel Repair Report ${filters.from} to ${filters.to}`} author="Fuel Repairs">
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerLabel}>REPAIR SUMMARY REPORT</Text>
          <Text style={styles.headerTitle}>{filters.from} → {filters.to}</Text>
          <Text style={styles.headerMeta}>Generated {generatedAt}</Text>
        </View>

        <View style={styles.cardsRow}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Total Spend</Text>
            <Text style={styles.cardValue}>{fmt(totals.spend)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Parts Cost</Text>
            <Text style={styles.cardValue}>{fmt(totals.parts_cost)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Closed</Text>
            <Text style={styles.cardValue}>{totals.repairs_closed}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Open</Text>
            <Text style={styles.cardValue}>{totals.repairs_open}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Spend by Location</Text>
        <View>
          <View style={styles.tableHeader}>
            <Text style={styles.cellText}>Location</Text>
            <Text style={styles.cellCenter}>Repairs</Text>
            <Text style={styles.cellNum}>Total</Text>
          </View>
          {by_location.length === 0 ? (
            <View style={styles.tableRow}><Text style={styles.cellText}>No data in range</Text></View>
          ) : by_location.map((r) => (
            <View key={r.location_id} style={styles.tableRow}>
              <Text style={styles.cellText}>{r.location_name}</Text>
              <Text style={styles.cellCenter}>{r.repair_count}</Text>
              <Text style={styles.cellNum}>{fmt(r.total_cost)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Top 10 Parts by Cost</Text>
        <View>
          <View style={styles.tableHeader}>
            <Text style={styles.cellTextSm}>Part</Text>
            <Text style={styles.cellCenter}>Qty</Text>
            <Text style={styles.cellNum}>Total</Text>
          </View>
          {top_parts.length === 0 ? (
            <View style={styles.tableRow}><Text style={styles.cellTextSm}>No parts used in range</Text></View>
          ) : top_parts.map((p) => (
            <View key={p.item_id} style={styles.tableRow}>
              <View style={styles.cellTextSm}>
                <Text>{p.item_name}</Text>
                {p.part_number ? <Text style={styles.partNum}>{p.part_number}</Text> : null}
              </View>
              <Text style={styles.cellCenter}>{p.total_qty}</Text>
              <Text style={styles.cellNum}>{fmt(p.total_cost)}</Text>
            </View>
          ))}
        </View>

        {by_pump.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Cost per Pump</Text>
            <View>
              <View style={styles.tableHeader}>
                <Text style={styles.cellText}>Location</Text>
                <Text style={styles.cellCenter}>Pump</Text>
                <Text style={styles.cellCenter}>Repairs</Text>
                <Text style={styles.cellNum}>Total</Text>
              </View>
              {by_pump.map((r, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={styles.cellText}>{r.location_name}</Text>
                  <Text style={styles.cellCenter}>{r.pump_number}</Text>
                  <Text style={styles.cellCenter}>{r.repair_count}</Text>
                  <Text style={styles.cellNum}>{fmt(r.total_cost)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Monthly Trend</Text>
        <View>
          <View style={styles.tableHeader}>
            <Text style={styles.cellText}>Month</Text>
            <Text style={styles.cellCenter}>Repairs</Text>
            <Text style={styles.cellNum}>Total</Text>
          </View>
          {by_month.length === 0 ? (
            <View style={styles.tableRow}><Text style={styles.cellText}>No data in range</Text></View>
          ) : by_month.map((r) => (
            <View key={r.month} style={styles.tableRow}>
              <Text style={styles.cellText}>{r.month}</Text>
              <Text style={styles.cellCenter}>{r.repair_count}</Text>
              <Text style={styles.cellNum}>{fmt(r.total_cost)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>Fuel Repair Summary · repairs.23fuels.com</Text>
      </Page>
    </Document>
  );
}

export async function renderReportPdf(data, { generatedAt = '' } = {}) {
  return await renderToBuffer(<ReportDocument data={data} generatedAt={generatedAt} />);
}
