import { ValidationPipe } from '@nestjs/common';
import {
  MaintenanceQueryDto,
  TransitionMaintenanceDto,
  UpdateMaintenanceDto,
} from './maintenance.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
});
const run = (metatype: new () => object, value: object) =>
  pipe.transform(value, { type: 'body', metatype });
const uuid = '25dc48f1-71e6-4ad1-9c2f-29db4b565f73';

describe('V1 maintenance has no assignment feature', () => {
  it.each([
    ['update', UpdateMaintenanceDto],
    ['transition', TransitionMaintenanceDto],
  ] as const)(
    'rejects assigneeUserId on %s explicitly (never silently ignored)',
    async (_name, dto) => {
      const body = dto === TransitionMaintenanceDto ? { toStatus: 'IN_PROGRESS' } : { title: 'T' };
      await expect(run(dto, { ...body, assigneeUserId: uuid })).rejects.toMatchObject({
        status: 400,
      });
      await expect(run(dto, { ...body, assigneeUserId: null })).rejects.toMatchObject({
        status: 400,
      });
    },
  );

  it('still accepts valid updates and transitions without an assignee', async () => {
    await expect(
      run(UpdateMaintenanceDto, { priority: 'URGENT', note: 'n' }),
    ).resolves.toBeDefined();
    await expect(run(TransitionMaintenanceDto, { toStatus: 'IN_PROGRESS' })).resolves.toBeDefined();
  });

  it('keeps the read-only list filter for historical assignees', async () => {
    await expect(run(MaintenanceQueryDto, { assigneeUserId: uuid })).resolves.toBeDefined();
  });
});
