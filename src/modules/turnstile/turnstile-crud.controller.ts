import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TurnstileCrudService } from './turnstile-crud.service';
import { CreateTurnstileDto } from 'src/common/dto/create-turnstile.dto';
import { UpdateTurnstileDto } from 'src/common/dto/update-turnstile.dto';

@Controller('turnstiles')
export class TurnstileCrudController {
  constructor(private readonly turnstileCrudService: TurnstileCrudService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createTurnstileDto: CreateTurnstileDto) {
    return await this.turnstileCrudService.create(createTurnstileDto);
  }

  @Get()
  async findByTenant(@Query('tenant') tenant: string) {
    return await this.turnstileCrudService.findByTenant(tenant);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return await this.turnstileCrudService.findById(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updateTurnstileDto: UpdateTurnstileDto) {
    return await this.turnstileCrudService.update(id, updateTurnstileDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.turnstileCrudService.delete(id);
  }
}