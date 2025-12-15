import db from './database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Parse JSON fields from a loan row
 */
function parseLoanRow(row) {
  if (!row) return null;
  return {
    ...row,
    changeOrders: JSON.parse(row.changeOrders || '[]'),
    contractReview: row.contractReview ? JSON.parse(row.contractReview) : null,
  };
}

/**
 * Create a new loan
 */
export function createLoan({ amount, borrowerName, loanType, interestRate }) {
  const loanId = `LOAN-${uuidv4().slice(0, 8).toUpperCase()}`;
  const createdAt = new Date().toISOString();
  const status = 'ACTIVE';

  const stmt = db.prepare(`
    INSERT INTO loans (loanId, status, amount, borrowerName, loanType, interestRate, createdAt, changeOrders)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(loanId, status, amount, borrowerName, loanType || null, interestRate || null, createdAt, '[]');

  return {
    loanId,
    status,
    amount,
    borrowerName,
    loanType: loanType || null,
    interestRate: interestRate || null,
    createdAt,
    changeOrders: [],
  };
}

/**
 * Get a loan by ID
 */
export function getLoanById(loanId) {
  const stmt = db.prepare('SELECT * FROM loans WHERE loanId = ?');
  const row = stmt.get(loanId);
  return parseLoanRow(row);
}

/**
 * Update loan with change order
 */
export function addChangeOrder(loanId, newAmount) {
  const loan = getLoanById(loanId);
  if (!loan) return null;

  const changeOrders = loan.changeOrders || [];
  const changeOrder = {
    previousAmount: loan.amount,
    newAmount,
    timestamp: new Date().toISOString(),
  };
  changeOrders.push(changeOrder);

  const lastChangeOrderAt = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE loans 
    SET amount = ?, lastChangeOrderAt = ?, changeOrders = ?
    WHERE loanId = ?
  `);

  stmt.run(newAmount, lastChangeOrderAt, JSON.stringify(changeOrders), loanId);

  return getLoanById(loanId);
}

/**
 * Cancel a loan
 */
export function cancelLoan(loanId, reason) {
  const cancelledAt = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE loans 
    SET status = 'CANCELLED', cancelReason = ?, cancelledAt = ?
    WHERE loanId = ?
  `);

  stmt.run(reason, cancelledAt, loanId);

  return getLoanById(loanId);
}

/**
 * Add contract review to loan
 */
export function addContractReview(loanId, decision, notes) {
  const contractReview = {
    decision,
    notes: notes || null,
    reviewedAt: new Date().toISOString(),
  };

  let statusUpdate = '';
  const params = [JSON.stringify(contractReview)];

  if (decision === 'REJECTED') {
    statusUpdate = ', status = ?';
    params.push('CPC_REJECTED');
  }

  params.push(loanId);

  const stmt = db.prepare(`
    UPDATE loans 
    SET contractReview = ?${statusUpdate}
    WHERE loanId = ?
  `);

  stmt.run(...params);

  return getLoanById(loanId);
}

/**
 * Get all loans
 */
export function getAllLoans() {
  const stmt = db.prepare('SELECT * FROM loans ORDER BY createdAt DESC');
  return stmt.all().map(parseLoanRow);
}

