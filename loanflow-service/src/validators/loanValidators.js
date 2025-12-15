import { z } from 'zod';

/**
 * Schema for creating a new loan
 */
export const createLoanSchema = z.object({
  amount: z.number().positive('Amount must be a positive number'),
  borrowerName: z.string().min(1, 'Borrower name is required').max(200),
  loanType: z.enum(['MORTGAGE', 'PERSONAL', 'BUSINESS', 'AUTO']).optional(),
  interestRate: z.number().min(0).max(100).optional(),
});

/**
 * Schema for change order request
 */
export const changeOrderSchema = z.object({
  newAmount: z.number().positive('New amount must be a positive number'),
});

/**
 * Schema for cancel loan request
 */
export const cancelLoanSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required').max(500),
});

/**
 * Schema for contract review request
 */
export const contractReviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED'], {
    errorMap: () => ({ message: 'Decision must be APPROVED or REJECTED' }),
  }),
  notes: z.string().max(1000).optional(),
});

/**
 * Validate request body against schema
 * Returns { success: true, data } or { success: false, errors }
 */
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

