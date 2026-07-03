import { apiClient } from '@appshore/web-core/shared/lib/api';
import type { LoginResponse } from './types';

export const authApi = {
  /**
   * Lookup user by email or phone (simplified login flow)
   */

  /**
   * Logout and revoke refresh token
   */
  logout: async (): Promise<void> => {
    return apiClient<void>('/auth/logout', {
      method: 'POST',
    });
  },

  /**
   * Get current user profile
   */
  getProfile: async (): Promise<LoginResponse['user']> => {
    return apiClient<LoginResponse['user']>('/auth/me');
  },

  /**
   * Update current user's profile (name)
   */
  updateProfile: async (data: { firstName?: string; lastName?: string }): Promise<LoginResponse['user']> => {
    return apiClient<LoginResponse['user']>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /**
   * Record password change and revoke other sessions
   */
  changePassword: async (revokeOtherSessions = true): Promise<{ success: boolean; sessionsRevoked: number }> => {
    return apiClient<{ success: boolean; sessionsRevoked: number }>('/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ revokeOtherSessions }),
    });
  },

  // ─── Phone Authentication ─────────────────────────────────────────────────

  /**
   * Send OTP to phone number (silently succeeds even if phone not registered)
   */
  sendPhoneOtp: async (phone: string): Promise<{ message: string }> => {
    return apiClient<{ message: string }>('/auth/phone/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },

  /**
   * Login with phone + PIN
   */
  phoneLogin: async (phone: string, pin: string): Promise<LoginResponse & { requiresPinSetup?: boolean }> => {
    return apiClient<LoginResponse & { requiresPinSetup?: boolean }>('/auth/phone/login', {
      method: 'POST',
      body: JSON.stringify({ phone, pin }),
    });
  },

  /**
   * Verify OTP code and get JWT tokens (OTP-based login / forgot PIN)
   */
  verifyOtp: async (phone: string, code: string): Promise<LoginResponse & { requiresPinSetup?: boolean }> => {
    return apiClient<LoginResponse & { requiresPinSetup?: boolean }>('/auth/phone/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    });
  },

  /**
   * Set 4-digit PIN for authenticated user
   */
  setPin: async (pin: string): Promise<{ message: string }> => {
    return apiClient<{ message: string }>('/auth/phone/set-pin', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  },

  /**
   * Add phone number to existing account and send OTP
   */
  addPhone: async (phone: string): Promise<{ message: string }> => {
    return apiClient<{ message: string }>('/auth/phone/add-phone', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  },

  /**
   * Verify OTP to confirm phone number on existing account
   */
  verifyAndAddPhone: async (phone: string, code: string): Promise<{ message: string }> => {
    return apiClient<{ message: string }>('/auth/phone/verify-add-phone', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    });
  },

  /**
   * Accept phone-channel invitation (OTP + PIN setup)
   */
  acceptPhoneInvitation: async (token: string, phone: string, otp: string, pin: string): Promise<LoginResponse> => {
    return apiClient<LoginResponse>('/invitations/accept-phone', {
      method: 'POST',
      body: JSON.stringify({ token, phone, otp, pin }),
    });
  },
};

// Re-export functions for backwards compatibility
export const logout = authApi.logout;
export const getProfile = authApi.getProfile;
