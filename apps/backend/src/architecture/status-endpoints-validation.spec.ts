import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { UpdateLegStatusDto } from '../domains/fleet/loads/dto/update-leg-status.dto';
import { LoadLegStatusSchema, LoadStopStatusSchema, FeedbackStatusEnum } from '@sally/shared-types';

/**
 * HTTP-edge validation contract tests.
 *
 * The original staging incident (PATCH /loads/:id/legs/:id/status returning
 * 400 for {status:"IN_TRANSIT"}) wasn't caught by existing controller specs
 * because they call the controller method directly, bypassing
 * `ValidationPipe`. These tests round-trip the DTO through the same pipe the
 * Nest framework instantiates in `main.ts`, so the contract is verified
 * end-to-end of the validation layer.
 *
 * If a future PR adds a new status column with lowercase values OR loosens
 * the @IsIn whitelist, one of these tests fails BEFORE the deploy.
 */
describe('Status endpoints — HTTP validation contract', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const legMeta: ArgumentMetadata = {
    type: 'body',
    metatype: UpdateLegStatusDto,
    data: '',
  };

  describe('PATCH /loads/:load_id/legs/:leg_id/status (the bug surface)', () => {
    for (const upper of LoadLegStatusSchema.options) {
      it(`accepts uppercase ${upper}`, async () => {
        await expect(pipe.transform({ status: upper }, legMeta)).resolves.toMatchObject({
          status: upper,
        });
      });
    }

    it('rejects lowercase in_transit (the original bug payload)', async () => {
      await expect(pipe.transform({ status: 'in_transit' }, legMeta)).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each(['pending', 'assigned', 'on_hold', 'delivered', 'cancelled'])('rejects lowercase %s', async (lower) => {
      await expect(pipe.transform({ status: lower }, legMeta)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unknown values', async () => {
      await expect(pipe.transform({ status: 'NOT_A_STATUS' }, legMeta)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects missing status', async () => {
      await expect(pipe.transform({}, legMeta)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  /**
   * Stop status DTO is declared inline in `loads.controller.ts` — we don't
   * import the class directly, but we exercise the same contract by parsing
   * the schema at runtime. If the controller's @IsIn drifts from the
   * shared-types enum, the convention test (status-conventions.spec) will
   * catch it via Zod side; this test asserts the LoadStopStatusSchema
   * itself enforces UPPER.
   */
  describe('LoadStopStatus contract', () => {
    it('every member is uppercase', () => {
      for (const v of LoadStopStatusSchema.options) {
        expect(v).toBe(v.toUpperCase());
      }
    });

    it('rejects lowercase variants at parse time', () => {
      for (const lower of ['pending', 'arrived', 'in_progress', 'completed']) {
        expect(LoadStopStatusSchema.safeParse(lower).success).toBe(false);
      }
    });
  });

  describe('FeedbackStatus contract', () => {
    it('every member is uppercase', () => {
      for (const v of FeedbackStatusEnum.options) {
        expect(v).toBe(v.toUpperCase());
      }
    });

    it('rejects lowercase variants at parse time', () => {
      for (const lower of ['new', 'reviewed', 'resolved']) {
        expect(FeedbackStatusEnum.safeParse(lower).success).toBe(false);
      }
    });
  });
});
