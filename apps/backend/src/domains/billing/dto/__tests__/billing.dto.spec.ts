import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateCheckoutDto,
  UpgradePlanDto,
  DowngradePlanDto,
  UpdateQuantityDto,
  CancelSubscriptionDto,
  SetupPaymentMethodDto,
  AddWalletCreditDto,
  IssueRefundDto,
  OverrideUnitPriceDto,
  ExtendTrialDto,
  ForceSuspendDto,
  AdminCreateSubscriptionDto,
  AdminChangePlanDto,
  PaginationQueryDto,
} from '../billing.dto';

describe('Billing DTOs', () => {
  // ─── CreateCheckoutDto ──────────────────────────────────────────

  describe('CreateCheckoutDto', () => {
    it('should validate a valid DTO', async () => {
      const dto = plainToInstance(CreateCheckoutDto, {
        plan: 'PROFESSIONAL',
        quantity: 3,
        successUrl: 'http://localhost:3000/success',
        cancelUrl: 'http://localhost:3000/cancel',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid plan', async () => {
      const dto = plainToInstance(CreateCheckoutDto, {
        plan: 'INVALID_PLAN',
        quantity: 1,
        successUrl: 'http://localhost/success',
        cancelUrl: 'http://localhost/cancel',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'plan')).toBe(true);
    });

    it('should reject quantity < 1', async () => {
      const dto = plainToInstance(CreateCheckoutDto, {
        plan: 'STARTER',
        quantity: 0,
        successUrl: 'http://localhost/success',
        cancelUrl: 'http://localhost/cancel',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'quantity')).toBe(true);
    });

    it('should reject missing successUrl', async () => {
      const dto = plainToInstance(CreateCheckoutDto, {
        plan: 'STARTER',
        quantity: 1,
        cancelUrl: 'http://localhost/cancel',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'successUrl')).toBe(true);
    });
  });

  // ─── UpgradePlanDto ─────────────────────────────────────────────

  describe('UpgradePlanDto', () => {
    it('should validate with just plan', async () => {
      const dto = plainToInstance(UpgradePlanDto, { newPlan: 'ENTERPRISE' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with plan and quantity', async () => {
      const dto = plainToInstance(UpgradePlanDto, {
        newPlan: 'PROFESSIONAL',
        newQuantity: 5,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid quantity', async () => {
      const dto = plainToInstance(UpgradePlanDto, {
        newPlan: 'PROFESSIONAL',
        newQuantity: 0,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'newQuantity')).toBe(true);
    });
  });

  // ─── DowngradePlanDto ───────────────────────────────────────────

  describe('DowngradePlanDto', () => {
    it('should validate valid plan', async () => {
      const dto = plainToInstance(DowngradePlanDto, { newPlan: 'STARTER' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid plan', async () => {
      const dto = plainToInstance(DowngradePlanDto, { newPlan: 'NOPE' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ─── UpdateQuantityDto ──────────────────────────────────────────

  describe('UpdateQuantityDto', () => {
    it('should validate valid quantity', async () => {
      const dto = plainToInstance(UpdateQuantityDto, { quantity: 10 });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject 0', async () => {
      const dto = plainToInstance(UpdateQuantityDto, { quantity: 0 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject non-integer', async () => {
      const dto = plainToInstance(UpdateQuantityDto, { quantity: 1.5 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ─── CancelSubscriptionDto ─────────────────────────────────────

  describe('CancelSubscriptionDto', () => {
    it('should validate with reason', async () => {
      const dto = plainToInstance(CancelSubscriptionDto, {
        reason: 'Too expensive',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate without reason', async () => {
      const dto = plainToInstance(CancelSubscriptionDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  // ─── SetupPaymentMethodDto ─────────────────────────────────────

  describe('SetupPaymentMethodDto', () => {
    it('should validate valid URL', async () => {
      const dto = plainToInstance(SetupPaymentMethodDto, {
        returnUrl: 'http://localhost:3000/billing',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject missing returnUrl', async () => {
      const dto = plainToInstance(SetupPaymentMethodDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ─── AddWalletCreditDto ────────────────────────────────────────

  describe('AddWalletCreditDto', () => {
    it('should validate valid credit', async () => {
      const dto = plainToInstance(AddWalletCreditDto, {
        amountCents: 5000,
        reason: 'Bonus',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject 0 amount', async () => {
      const dto = plainToInstance(AddWalletCreditDto, {
        amountCents: 0,
        reason: 'Bonus',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'amountCents')).toBe(true);
    });

    it('should reject missing reason', async () => {
      const dto = plainToInstance(AddWalletCreditDto, {
        amountCents: 1000,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'reason')).toBe(true);
    });
  });

  // ─── IssueRefundDto ────────────────────────────────────────────

  describe('IssueRefundDto', () => {
    it('should validate with all fields', async () => {
      const dto = plainToInstance(IssueRefundDto, {
        paymentId: 'pi_123',
        amountCents: 2500,
        reason: 'Duplicate',
        creditWallet: true,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with only required fields', async () => {
      const dto = plainToInstance(IssueRefundDto, {
        paymentId: 'pi_123',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject missing paymentId', async () => {
      const dto = plainToInstance(IssueRefundDto, {});
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'paymentId')).toBe(true);
    });
  });

  // ─── OverrideUnitPriceDto ──────────────────────────────────────

  describe('OverrideUnitPriceDto', () => {
    it('should validate 0 (free)', async () => {
      const dto = plainToInstance(OverrideUnitPriceDto, { unitPriceCents: 0 });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject negative price', async () => {
      const dto = plainToInstance(OverrideUnitPriceDto, {
        unitPriceCents: -100,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ─── ExtendTrialDto ────────────────────────────────────────────

  describe('ExtendTrialDto', () => {
    it('should validate valid days', async () => {
      const dto = plainToInstance(ExtendTrialDto, { days: 30 });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject 0 days', async () => {
      const dto = plainToInstance(ExtendTrialDto, { days: 0 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ─── ForceSuspendDto ───────────────────────────────────────────

  describe('ForceSuspendDto', () => {
    it('should validate with reason', async () => {
      const dto = plainToInstance(ForceSuspendDto, { reason: 'Fraud' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject missing reason', async () => {
      const dto = plainToInstance(ForceSuspendDto, {});
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'reason')).toBe(true);
    });
  });

  // ─── AdminCreateSubscriptionDto ────────────────────────────────

  describe('AdminCreateSubscriptionDto', () => {
    it('should validate with all fields', async () => {
      const dto = plainToInstance(AdminCreateSubscriptionDto, {
        plan: 'ENTERPRISE',
        quantity: 10,
        customPriceCents: 4500,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate without optional customPriceCents', async () => {
      const dto = plainToInstance(AdminCreateSubscriptionDto, {
        plan: 'STARTER',
        quantity: 1,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should reject invalid plan', async () => {
      const dto = plainToInstance(AdminCreateSubscriptionDto, {
        plan: 'FAKE',
        quantity: 1,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'plan')).toBe(true);
    });
  });

  // ─── AdminChangePlanDto ────────────────────────────────────────

  describe('AdminChangePlanDto', () => {
    it('should validate with plan only', async () => {
      const dto = plainToInstance(AdminChangePlanDto, {
        plan: 'PROFESSIONAL',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with plan and quantity', async () => {
      const dto = plainToInstance(AdminChangePlanDto, {
        plan: 'ENTERPRISE',
        quantity: 5,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  // ─── PaginationQueryDto ────────────────────────────────────────

  describe('PaginationQueryDto', () => {
    it('should validate empty query (all optional)', async () => {
      const dto = plainToInstance(PaginationQueryDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should validate with limit and cursor', async () => {
      const dto = plainToInstance(PaginationQueryDto, {
        limit: '10',
        cursor: 'abc123',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should transform string limit to number', () => {
      const dto = plainToInstance(PaginationQueryDto, { limit: '25' });
      expect(dto.limit).toBe(25);
    });

    it('should reject limit < 1', async () => {
      const dto = plainToInstance(PaginationQueryDto, { limit: '0' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });
  });
});
