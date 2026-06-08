import { validate } from 'class-validator';
import { UpdateScheduleDto } from '../dto/update-schedule.dto';

describe('UpdateScheduleDto', () => {
  it('should accept a valid cron pattern', async () => {
    const dto = new UpdateScheduleDto();
    dto.pattern = '0 3 * * *';
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject an invalid cron pattern', async () => {
    const dto = new UpdateScheduleDto();
    dto.pattern = 'not a cron expression';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    const patternError = errors.find((e) => e.property === 'pattern');
    expect(patternError).toBeDefined();
  });

  it('should accept a valid intervalMs', async () => {
    const dto = new UpdateScheduleDto();
    dto.intervalMs = 60000;
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject intervalMs below minimum (10000ms)', async () => {
    const dto = new UpdateScheduleDto();
    dto.intervalMs = 5000;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject intervalMs above maximum (86400000ms)', async () => {
    const dto = new UpdateScheduleDto();
    dto.intervalMs = 86400001;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept a boolean isEnabled', async () => {
    const dto = new UpdateScheduleDto();
    dto.isEnabled = false;
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should allow all fields to be optional', async () => {
    const dto = new UpdateScheduleDto();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should accept all fields together', async () => {
    const dto = new UpdateScheduleDto();
    dto.pattern = '*/5 * * * *';
    dto.intervalMs = 30000;
    dto.isEnabled = true;
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
