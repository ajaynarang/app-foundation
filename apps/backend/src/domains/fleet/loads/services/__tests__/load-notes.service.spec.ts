import { Test, TestingModule } from '@nestjs/testing';
import { LoadNotesService } from '../load-notes.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('LoadNotesService', () => {
  let service: LoadNotesService;
  let prisma: {
    loadNote: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      loadNote: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LoadNotesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<LoadNotesService>(LoadNotesService);
  });

  describe('addNote', () => {
    it('should create a note with default type', async () => {
      prisma.loadNote.create.mockResolvedValue({ id: 1, noteType: 'note' });

      await service.addNote({
        loadId: 1,
        userId: 42,
        content: 'Customer called about delivery window',
      });

      expect(prisma.loadNote.create).toHaveBeenCalledWith({
        data: {
          loadId: 1,
          userId: 42,
          content: 'Customer called about delivery window',
          noteType: 'note',
        },
      });
    });

    it('should create a note with custom type', async () => {
      prisma.loadNote.create.mockResolvedValue({
        id: 2,
        noteType: 'dispatch_update',
      });

      await service.addNote({
        loadId: 1,
        userId: 42,
        content: 'Re-routed due to weather',
        noteType: 'dispatch_update',
      });

      expect(prisma.loadNote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ noteType: 'dispatch_update' }),
      });
    });
  });

  describe('getNotes', () => {
    it('should return notes for a load', async () => {
      const notes = [{ id: 1, content: 'Note 1' }];
      prisma.loadNote.findMany.mockResolvedValue(notes);

      const result = await service.getNotes(1);

      expect(prisma.loadNote.findMany).toHaveBeenCalledWith({
        where: { loadId: 1 },
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
      });
      expect(result).toEqual(notes);
    });
  });

  describe('pinNote', () => {
    it('should toggle pin status', async () => {
      prisma.loadNote.findUnique.mockResolvedValue({ id: 1, isPinned: false });
      prisma.loadNote.update.mockResolvedValue({ id: 1, isPinned: true });

      await service.pinNote(1);

      expect(prisma.loadNote.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { isPinned: true },
      });
    });

    it('should throw NotFoundException for missing note', async () => {
      prisma.loadNote.findUnique.mockResolvedValue(null);

      await expect(service.pinNote(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteNote', () => {
    it('should delete the note', async () => {
      prisma.loadNote.findUnique.mockResolvedValue({ id: 1 });
      prisma.loadNote.delete.mockResolvedValue({ id: 1 });

      await service.deleteNote(1);

      expect(prisma.loadNote.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should throw NotFoundException for missing note', async () => {
      prisma.loadNote.findUnique.mockResolvedValue(null);

      await expect(service.deleteNote(999)).rejects.toThrow(NotFoundException);
    });
  });
});
