import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PinService {
  private readonly logger = new Logger(PinService.name);
  private readonly SALT_ROUNDS = 10;

  async hashPin(pin: string): Promise<string> {
    return bcrypt.hash(pin, this.SALT_ROUNDS);
  }

  async verifyPin(pin: string, hash: string): Promise<boolean> {
    return bcrypt.compare(pin, hash);
  }

  isValidPin(pin: string): boolean {
    return /^\d{4}$/.test(pin);
  }
}
