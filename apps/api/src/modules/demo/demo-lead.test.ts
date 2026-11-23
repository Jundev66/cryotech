import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DemoService } from './demo.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MeasurementUnitsService } from '../measurement-units/measurement-units.service';
import { ProductCategoriesService } from '../product-categories/product-categories.service';

describe('DemoService - Lead Capture and Tracking', () => {
  let demoService: DemoService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      demoLead: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        groupBy: vi.fn(),
        update: vi.fn(),
      },
      company: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn().mockImplementation(async (callback) => {
        const createMockTable = () => ({
          create: vi.fn().mockResolvedValue({ id: 'mock-id' }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        });
        const tx = new Proxy({}, {
          get: (_target, prop) => {
            if (prop === 'user') {
              return {
                create: vi.fn().mockResolvedValue({ id: 'mock-user-id', email: 'carlos@correo.com', fullName: 'Carlos Granja Sol' }),
              };
            }
            if (prop === 'company') {
              return {
                create: vi.fn().mockResolvedValue({ id: 'mock-company-id', name: 'Granja Carlos Granja Sol' }),
              };
            }
            return createMockTable();
          },
        });
        return callback(tx);
      }),
    };

    const mockJwt = {
      sign: vi.fn().mockReturnValue('mock-jwt-token'),
    };

    const mockConfig = {
      get: vi.fn(),
    };

    const mockMeasurementUnits = {} as MeasurementUnitsService;
    const mockProductCategories = {} as ProductCategoriesService;

    demoService = new DemoService(
      mockPrisma as unknown as PrismaService,
      mockJwt as unknown as JwtService,
      mockConfig as unknown as ConfigService,
      mockMeasurementUnits,
      mockProductCategories,
    );
  });

  it('captures lead in demoLead table and provisions demo session', async () => {
    const input = {
      fullName: 'Carlos Granja Sol',
      phone: '+58 412 1234567',
      email: 'carlos@correo.com',
      farmSize: '500-2000',
      source: 'erp_landing' as const,
    };

    const createdLeadRecord = {
      id: 'lead-uuid-1234',
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      farmSize: input.farmSize,
      source: input.source,
      status: 'new',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.demoLead.create.mockResolvedValue(createdLeadRecord);

    const result = await demoService.captureLeadAndCreateSession(input, '192.168.1.50');

    expect(mockPrisma.demoLead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fullName: 'Carlos Granja Sol',
        phone: '+58 412 1234567',
        email: 'carlos@correo.com',
        farmSize: '500-2000',
        source: 'erp_landing',
        ipHash: expect.any(String),
      }),
    });

    expect(result).toHaveProperty('leadId', 'lead-uuid-1234');
    expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
    expect(result).toHaveProperty('company');
  });

  it('paginates and aggregates stats in listLeads', async () => {
    mockPrisma.demoLead.findMany.mockResolvedValue([
      { id: '1', fullName: 'Lead 1', phone: '+58 412 1111111', status: 'new' },
    ]);
    mockPrisma.demoLead.count.mockResolvedValue(1);
    mockPrisma.demoLead.groupBy.mockResolvedValue([
      { status: 'new', _count: { _all: 1 } },
    ]);

    const result = await demoService.listLeads({ page: 1, limit: 10 });

    expect(result.pagination.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.stats).toEqual({ new: 1 });
  });

  it('updates lead status and notes', async () => {
    mockPrisma.demoLead.update.mockResolvedValue({
      id: 'lead-1',
      status: 'contacted',
      notes: 'Contactado por WhatsApp',
    });

    const result = await demoService.updateLeadStatus('lead-1', 'contacted', 'Contactado por WhatsApp');

    expect(mockPrisma.demoLead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: {
        status: 'contacted',
        notes: 'Contactado por WhatsApp',
      },
    });
    expect(result.status).toBe('contacted');
  });
});
