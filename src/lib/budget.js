// Budget helpers: browser-local persistence plus summary building for
// AI analysis. Transactions look like:
// { id, description, amount, type: 'expense'|'income', category, date }
const STORAGE_KEY = 'ouagx.budget.v1';

export const BUDGET_CATEGORIES = ['food', 'transport', 'housing', 'fun', 'health', 'other'];

export function loadTransactions() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((t) => t && typeof t.amount === 'number') : [];
  } catch {
    return [];
  }
}

export function saveTransactions(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function summarizeBudget(list) {
  const txs = Array.isArray(list) ? list : [];
  let income = 0;
  let expenses = 0;
  const byCategory = {};
  for (const t of txs) {
    const amount = Number(t.amount) || 0;
    if (t.type === 'income') {
      income += amount;
    } else {
      expenses += amount;
      const category = t.category || 'other';
      byCategory[category] = (byCategory[category] || 0) + amount;
    }
  }
  return { count: txs.length, income, expenses, balance: income - expenses, byCategory };
}

export function buildBudgetPrompt(list, question) {
  const txs = Array.isArray(list) ? list : [];
  const summary = summarizeBudget(txs);
  const lines = [
    `Transactions: ${summary.count}`,
    `Total income: ${summary.income.toFixed(2)}`,
    `Total expenses: ${summary.expenses.toFixed(2)}`,
    `Balance: ${summary.balance.toFixed(2)}`,
    'Expenses by category:',
    ...Object.entries(summary.byCategory).map(([name, value]) => `- ${name}: ${value.toFixed(2)}`),
    'Recent transactions:',
    ...txs.slice(-10).map(
      (t) => `- ${t.date || ''} ${t.type} ${t.category || ''}: ${t.description} (${Number(t.amount).toFixed(2)})`,
    ),
    '',
    question,
  ];
  return lines.join('\n');
}
