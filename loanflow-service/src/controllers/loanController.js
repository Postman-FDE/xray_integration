import * as loanService from '../services/loanService.js';
import {
  createLoanSchema,
  changeOrderSchema,
  cancelLoanSchema,
  contractReviewSchema,
  validate,
} from '../validators/loanValidators.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../middleware/errorHandler.js';

/**
 * GET /loans
 * List all loans
 */
export function listLoans(req, res, next) {
  try {
    const loans = loanService.getAllLoans();
    res.json({ loans, count: loans.length });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /loans
 * Create a new loan
 */
export function createLoan(req, res, next) {
  try {
    const validation = validate(createLoanSchema, req.body);
    if (!validation.success) {
      throw new ValidationError(validation.errors);
    }

    const loan = loanService.createLoan(validation.data);
    res.status(201).json(loan);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /loans/:loanId
 * Get a single loan by ID
 */
export function getLoan(req, res, next) {
  try {
    const { loanId } = req.params;
    const loan = loanService.getLoanById(loanId);

    if (!loan) {
      throw new NotFoundError('Loan', loanId);
    }

    res.json(loan);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /loans/:loanId/change-order
 * Submit a change order to modify loan amount
 * Only allowed if loan status is "ACTIVE"
 */
export function submitChangeOrder(req, res, next) {
  try {
    const { loanId } = req.params;
    const loan = loanService.getLoanById(loanId);

    if (!loan) {
      throw new NotFoundError('Loan', loanId);
    }

    if (loan.status !== 'ACTIVE') {
      throw new ConflictError(
        `Change order not allowed. Loan status is '${loan.status}', but must be 'ACTIVE'`
      );
    }

    const validation = validate(changeOrderSchema, req.body);
    if (!validation.success) {
      throw new ValidationError(validation.errors);
    }

    const updatedLoan = loanService.addChangeOrder(loanId, validation.data.newAmount);
    res.json(updatedLoan);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /loans/:loanId/cancel
 * Cancel a loan
 * Only allowed if loan status is "ACTIVE"
 */
export function cancelLoan(req, res, next) {
  try {
    const { loanId } = req.params;
    const loan = loanService.getLoanById(loanId);

    if (!loan) {
      throw new NotFoundError('Loan', loanId);
    }

    if (loan.status === 'CANCELLED') {
      throw new ConflictError('Loan is already cancelled');
    }

    if (loan.status !== 'ACTIVE') {
      throw new ConflictError(
        `Cannot cancel loan. Loan status is '${loan.status}', but must be 'ACTIVE'`
      );
    }

    const validation = validate(cancelLoanSchema, req.body);
    if (!validation.success) {
      throw new ValidationError(validation.errors);
    }

    const updatedLoan = loanService.cancelLoan(loanId, validation.data.reason);
    res.json(updatedLoan);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /loans/:loanId/contract-review
 * Submit a contract review decision
 * If decision is "REJECTED", loan status becomes "CPC_REJECTED"
 */
export function submitContractReview(req, res, next) {
  try {
    const { loanId } = req.params;
    const loan = loanService.getLoanById(loanId);

    if (!loan) {
      throw new NotFoundError('Loan', loanId);
    }

    const validation = validate(contractReviewSchema, req.body);
    if (!validation.success) {
      throw new ValidationError(validation.errors);
    }

    const { decision, notes } = validation.data;
    const updatedLoan = loanService.addContractReview(loanId, decision, notes);
    res.json(updatedLoan);
  } catch (error) {
    next(error);
  }
}

