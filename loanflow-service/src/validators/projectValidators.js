import { z } from 'zod';

/**
 * Schema for TPO (Third Party Originator) info
 */
const tpoInfoSchema = z.object({
  companyName: z.string().optional(),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  licenseNumber: z.string().optional(),
}).passthrough(); // Allow additional properties

/**
 * Schema for creating a new project
 */
export const createProjectSchema = z.object({
  loanId: z.string().min(1, 'Loan ID is required'),
  name: z.string().min(1, 'Project name is required').max(200),
  tpoInfo: tpoInfoSchema,
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

