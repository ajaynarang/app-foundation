import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { fieldErrorsOf } from '@appshore/platform/test/helpers/field-errors.helpers';
import { AdminTicketListQueryDto, TicketListQueryDto } from '../dto/ticket-list-query.dto';
import { Test } from '@nestjs/testing';
import { SupportController } from '../support.controller';
import { SupportService } from '../support.service';

describe('SupportController', () => {
  let controller: SupportController;
  let service: any;

  const mockUser = {
    tenantDbId: 1,
    dbId: 42,
    userId: 'u-1',
    role: 'MEMBER',
  };

  beforeEach(async () => {
    service = {
      createTicket: jest.fn().mockResolvedValue({ id: 1 }),
      listTicketsForTenant: jest.fn().mockResolvedValue({ tickets: [], total: 0 }),
      getTicket: jest.fn().mockResolvedValue({ id: 1 }),
      addMessage: jest.fn().mockResolvedValue({ id: 1 }),
      listAllTickets: jest.fn().mockResolvedValue({ tickets: [] }),
      updateTicket: jest.fn().mockResolvedValue({ id: 1 }),
      getStats: jest.fn().mockResolvedValue({ open: 5 }),
      getTenants: jest.fn().mockResolvedValue([]),
    };

    const module = await Test.createTestingModule({
      controllers: [SupportController],
      providers: [{ provide: SupportService, useValue: service }],
    }).compile();

    controller = module.get(SupportController);
  });

  it('should create ticket', async () => {
    const dto = { subject: 'Help', message: 'Need help' } as any;
    await controller.createTicket(mockUser, dto);
    expect(service.createTicket).toHaveBeenCalledWith(1, 42, dto);
  });

  it('should list my tickets', async () => {
    await controller.listMyTickets(
      mockUser,
      await readQueryDto(TicketListQueryDto, { status: 'OPEN', limit: '10', offset: '0' }),
    );
    expect(service.listTicketsForTenant).toHaveBeenCalledWith(1, {
      status: 'OPEN',
      limit: 10,
      offset: 0,
    });
  });

  it('should list tickets with no params', async () => {
    await controller.listMyTickets(mockUser, await readQueryDto(TicketListQueryDto, {}));
    expect(service.listTicketsForTenant).toHaveBeenCalledWith(1, {
      status: undefined,
      limit: undefined,
      offset: undefined,
    });
  });

  it('should get ticket', async () => {
    await controller.getTicket(1, mockUser);
    expect(service.getTicket).toHaveBeenCalledWith(1, 1);
  });

  it('should add message', async () => {
    const dto = { content: 'reply' } as any;
    await controller.addMessage(1, mockUser, dto);
    expect(service.addMessage).toHaveBeenCalledWith(1, 42, 'user', dto, 1);
  });

  it('should list all tickets (super admin)', async () => {
    await controller.listAllTickets(
      await readQueryDto(AdminTicketListQueryDto, {
        tenant_id: '1',
        status: 'OPEN',
        priority: 'HIGH',
        category: 'BILLING',
        q: 'test',
        limit: '20',
        offset: '0',
      }),
    );
    expect(service.listAllTickets).toHaveBeenCalledWith({
      tenantId: 1,
      status: 'OPEN',
      priority: 'HIGH',
      category: 'BILLING',
      search: 'test',
      limit: 20,
      offset: 0,
    });
  });

  it('answers 400 naming the bad param, and refuses the old tenantId and search keys', async () => {
    const read = (raw: Record<string, unknown>) => readQueryDto(AdminTicketListQueryDto, raw);
    expect(await fieldErrorsOf(read({ tenant_id: 'abc' }))).toHaveProperty('tenant_id');
    expect(await fieldErrorsOf(read({ status: 'open' }))).toHaveProperty('status');
    expect(await fieldErrorsOf(read({ limit: 'abc' }))).toHaveProperty('limit');
    expect(await fieldErrorsOf(read({ offset: '-1' }))).toHaveProperty('offset');
    expect(await fieldErrorsOf(read({ tenantId: '1' }))).toHaveProperty('tenantId');
    expect(await fieldErrorsOf(read({ search: 'x' }))).toHaveProperty('search');
  });

  it('should get admin ticket', async () => {
    await controller.getAdminTicket(1);
    expect(service.getTicket).toHaveBeenCalledWith(1, 0, true);
  });

  it('should update ticket', async () => {
    const dto = { status: 'closed' } as any;
    await controller.updateTicket(1, dto);
    expect(service.updateTicket).toHaveBeenCalledWith(1, dto);
  });

  it('should add admin message', async () => {
    const dto = { content: 'admin reply' } as any;
    await controller.addAdminMessage(1, mockUser, dto);
    expect(service.addMessage).toHaveBeenCalledWith(1, 42, 'admin', dto, 0, true);
  });

  it('should get stats', async () => {
    const result = await controller.getStats();
    expect(result).toEqual({ open: 5 });
  });

  it('should get tenants', async () => {
    await controller.getTenants();
    expect(service.getTenants).toHaveBeenCalled();
  });
});
