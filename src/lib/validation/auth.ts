import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email({ message: 'Please enter a valid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

export const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, { message: 'Username must be at least 3 characters' })
      .max(30, { message: 'Username cannot exceed 30 characters' })
      .regex(/^[a-zA-Z0-9_-]+$/, {
        message: 'Username may only contain letters, numbers, underscores, and hyphens',
      }),
    displayName: z
      .string()
      .trim()
      .min(1, { message: 'Display name is required' })
      .max(40, { message: 'Display name cannot exceed 40 characters' }),
    email: z.string().trim().email({ message: 'Please enter a valid email address' }),
    password: z
      .string()
      .min(8, { message: 'Password must be at least 8 characters' })
      .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
      .regex(/[0-9]/, { message: 'Password must contain at least one number' }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email({ message: 'Please enter a valid email address' }),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, { message: 'Password must be at least 8 characters' })
      .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
      .regex(/[0-9]/, { message: 'Password must contain at least one number' }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const profileUpdateSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { message: 'Display name cannot be empty' })
    .max(40, { message: 'Display name cannot exceed 40 characters' }),
  username: z
    .string()
    .trim()
    .min(3, { message: 'Username must be at least 3 characters' })
    .max(30, { message: 'Username cannot exceed 30 characters' })
    .regex(/^[a-zA-Z0-9_-]+$/, {
      message: 'Username may only contain letters, numbers, underscores, and hyphens',
    }),
  bio: z.string().max(200, { message: 'Bio cannot exceed 200 characters' }).optional().nullable(),
  customStatus: z
    .string()
    .max(80, { message: 'Status message cannot exceed 80 characters' })
    .optional()
    .nullable(),
  status: z.enum(['online', 'idle', 'dnd', 'offline']),
  bannerColor: z.string().optional().nullable(),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
export type ProfileUpdateFormData = z.infer<typeof profileUpdateSchema>;
