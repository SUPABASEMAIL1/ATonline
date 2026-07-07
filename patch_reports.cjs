const fs = require('fs');

const reportsPath = 'src/components/reports/ReportsManager.tsx';
let reports = fs.readFileSync(reportsPath, 'utf8');

// Replace standard revenue sums
// e.g. filteredSales.filter(s => s.status !== 'refunded' && s.status !== 'deleted').forEach(sale => { ... sale.total ... })
// But wait, there are also s.status === 'refunded'

// Let's create a helper inside ReportsManager to get effective total:
// const getEffectiveTotal = (sale) => (sale.total || 0) - (sale.refundedAmount || 0);

reports = reports.replace(
  /export default function ReportsManager/g,
  `const getEffectiveTotal = (sale: Sale) => (sale.total || 0) - (sale.refundedAmount || 0);\n\nexport default function ReportsManager`
);

// We should replace `Number(sale.total || 0)` and `Number(sale.total)` in loops with `getEffectiveTotal(sale)`
// Let's just do text replacements for known lines
reports = reports.replace(/Number\(sale\.total\) \|\| 0\)/g, 'getEffectiveTotal(sale))');
reports = reports.replace(/Number\(sale\.total \|\| 0\)/g, 'getEffectiveTotal(sale)');

// Fix line 886: row += `,${formatNumberWithPrecision(totalCostLocal)},${formatNumberWithPrecision(sale.total - totalCostLocal)}`;
// -> formatNumberWithPrecision(getEffectiveTotal(sale) - totalCostLocal)
reports = reports.replace(/sale\.total - totalCostLocal/g, 'getEffectiveTotal(sale) - totalCostLocal');

// Fix getAmountByMethod refunds calculation
// const refunds = filteredSales.filter(s => s.status === 'refunded').reduce((a, x) => a + getAmountByMethod(x, method), 0);
// It should also include partially_refunded amounts. But wait, getAmountByMethod(x, method) returns the amount paid by that method.
// For partial refunds, how do we know which method was refunded?
// The spec says: "refundPayment ... method: sale.paymentMethod === 'split' ? 'cash' : (sale.paymentMethod || 'cash')"
// So we can say partial refunds are refunded to the sale's primary payment method.

const refundLogic = `const refunds = filteredSales.reduce((a, x) => {
        if (x.status === 'refunded') return a + getAmountByMethod(x, method);
        if (x.status === 'partially_refunded') {
          // Approximate proportional refund for split, or direct for others
          if (x.paymentMethod === 'split') {
            const ratio = getAmountByMethod(x, method) / (x.total || 1);
            return a + (x.refundedAmount || 0) * ratio;
          } else if (x.paymentMethod === method || (!x.paymentMethod && method === 'cash')) {
            return a + (x.refundedAmount || 0);
          }
        }
        return a;
      }, 0);`;

reports = reports.replace(/const refunds = filteredSales\.filter\(s => s\.status === 'refunded'\)\.reduce\(\(a, x\) => a \+ getAmountByMethod\(x, method\), 0\);/g, refundLogic);

// Fix getRevenue:
// if (s.status === 'refunded') return sum - s.total;
const getRevenueLogic = `if (s.status === 'refunded') return sum - (s.total || 0);
    if (s.status === 'partially_refunded') return sum - (s.refundedAmount || 0);`;
reports = reports.replace(/if \(s\.status === 'refunded'\) return sum - s\.total;/g, getRevenueLogic);

fs.writeFileSync(reportsPath, reports);

const dashPath = 'src/components/dashboard/DashboardManager.tsx';
let dash = fs.readFileSync(dashPath, 'utf8');

dash = dash.replace(/if \(s\.status === 'refunded'\) return sum - s\.total;/g, getRevenueLogic);
dash = dash.replace(/if \(s\.status === 'refunded'\) return sum - amt;/g, `if (s.status === 'refunded') return sum - amt;\n        if (s.status === 'partially_refunded') return sum - (s.refundedAmount || 0) * (amt / (s.total || 1));`);

// const amount = sale.status === 'refunded' ? -sale.total : ((sale.status === 'completed' || sale.status === 'credit') ? sale.total : 0);
const dashAmountLogic = `let amount = 0;
      if (sale.status === 'refunded') amount = -(sale.total || 0);
      else if (sale.status === 'partially_refunded') amount = (sale.total || 0) - (sale.refundedAmount || 0);
      else if (sale.status === 'completed' || sale.status === 'credit') amount = sale.total || 0;`;

dash = dash.replace(/const amount = sale\.status === 'refunded' \? -sale\.total : \(\(sale\.status === 'completed' \|\| sale\.status === 'credit'\) \? sale\.total : 0\);/g, dashAmountLogic);

fs.writeFileSync(dashPath, dash);

console.log("Patched files");
