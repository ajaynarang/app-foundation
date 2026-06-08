import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

@Injectable()
export class LoadNotesService {
  private readonly logger = new Logger(LoadNotesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async addNote(params: { loadId: number; userId: number; content: string; noteType?: string }) {
    return this.prisma.loadNote.create({
      data: {
        loadId: params.loadId,
        userId: params.userId,
        content: params.content,
        noteType: params.noteType || 'note',
      },
    });
  }

  async getNotes(loadId: number, limit = 50, offset = 0) {
    return this.prisma.loadNote.findMany({
      where: { loadId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async pinNote(noteId: number) {
    const note = await this.prisma.loadNote.findUnique({
      where: { id: noteId },
    });
    if (!note) {
      throw new NotFoundException(`Note not found: ${noteId}`);
    }

    return this.prisma.loadNote.update({
      where: { id: noteId },
      data: { isPinned: !note.isPinned },
    });
  }

  async deleteNote(noteId: number) {
    const note = await this.prisma.loadNote.findUnique({
      where: { id: noteId },
    });
    if (!note) {
      throw new NotFoundException(`Note not found: ${noteId}`);
    }

    return this.prisma.loadNote.delete({ where: { id: noteId } });
  }
}
