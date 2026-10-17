// Tests for the budget helpers. Run: npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBudgetPrompt, summarizeBudget } from './budget.js';

const SAMPLE = [
  { id: 1, description: 'pay', amount: 1000, type: 'income', category: 'income', date: '2026-10-01' },
  { id: 2, description: 'groceries', amount: 80, type: 'expense', category: 'food', date: '2026-10-02' },
  { id: 3, description: 'bus', amount: 20, type: 'expense', category: 'transport', date: '2026-10-03' },
  { id: 4, description: 'pizza', amount: 25, type: 'expense', category: 'food', date: '2026-10-04' },
];

describe('summarizeBudget', () => {
  it('totals income, expenses, balance, and categories', () => {
    assert.deepEqual(summarizeBudget(SAMPLE), {
      count: 4,
      income: 1000,
      expenses: 125,
      balance: 875,
      byCategory: { food: 105, transport: 20 },
    });
  });

  it('handles an empty list', () => {
    assert.deepEqual(summarizeBudget([]), {
      count: 0,
      income: 0,
      expenses: 0,
      balance: 0,
      byCategory: {},
    });
  });
});

describe('buildBudgetPrompt', () => {
  it('packs the summary, categories, and question together', () => {
    const prompt = buildBudgetPrompt(SAMPLE, 'Any tips?');
    assert.match(prompt, /Total income: 1000\.00/);
    assert.match(prompt, /Balance: 875\.00/);
    assert.match(prompt, /- food: 105\.00/);
    assert.match(prompt, /pizza/);
    assert.match(prompt, /Any tips\?/);
  });
});
