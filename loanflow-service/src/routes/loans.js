import { Router } from 'express';
import * as loanController from '../controllers/loanController.js';

const router = Router();

// GET /loans - List all loans
router.get('/', loanController.listLoans);

// POST /loans - Create a new loan
router.post('/', loanController.createLoan);

// GET /loans/:loanId - Get loan by ID
router.get('/:loanId', loanController.getLoan);

// POST /loans/:loanId/change-order - Submit change order
router.post('/:loanId/change-order', loanController.submitChangeOrder);

// POST /loans/:loanId/cancel - Cancel loan
router.post('/:loanId/cancel', loanController.cancelLoan);

// POST /loans/:loanId/contract-review - Submit contract review
router.post('/:loanId/contract-review', loanController.submitContractReview);

export default router;

