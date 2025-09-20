import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Turnstile, TurnstileDocument } from 'src/common/schemas/turnstile.schema';
import { CreateTurnstileDto } from 'src/common/dto/create-turnstile.dto';
import { UpdateTurnstileDto } from 'src/common/dto/update-turnstile.dto';

@Injectable()
export class TurnstileCrudService {
  constructor(
    @InjectModel(Turnstile.name)
    private turnstileModel: Model<TurnstileDocument>,
  ) {}

  async create(createTurnstileDto: CreateTurnstileDto): Promise<Turnstile> {
    const existing = await this.turnstileModel.findOne({ id: createTurnstileDto.id });
    if (existing) {
      throw new ConflictException('Turnstile ID already exists');
    }

    const turnstile = new this.turnstileModel(createTurnstileDto);
    return await turnstile.save();
  }

  async findByTenant(tenant: string): Promise<Turnstile[]> {
    return await this.turnstileModel.find({ tenant }).sort({ name: 1 });
  }

  async findById(id: string): Promise<Turnstile> {
    const turnstile = await this.turnstileModel.findOne({ id });
    if (!turnstile) {
      throw new NotFoundException('Turnstile not found');
    }
    return turnstile;
  }

  async update(id: string, updateTurnstileDto: UpdateTurnstileDto): Promise<Turnstile> {
    const turnstile = await this.turnstileModel.findOneAndUpdate(
      { id },
      updateTurnstileDto,
      { new: true }
    );
    if (!turnstile) {
      throw new NotFoundException('Turnstile not found');
    }
    return turnstile;
  }

  async delete(id: string): Promise<void> {
    const result = await this.turnstileModel.deleteOne({ id });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Turnstile not found');
    }
  }
}