import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class TurnstileExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(TurnstileExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erro interno do servidor';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
    } else if (exception instanceof Error) {
      message = exception.message;

      // Mapear erros específicos para códigos HTTP
      if (
        message.includes('Token JWT inválido') ||
        message.includes('Token expirado')
      ) {
        status = HttpStatus.BAD_REQUEST;
      } else if (
        message.includes('não autorizado') ||
        message.includes('não permitido')
      ) {
        status = HttpStatus.FORBIDDEN;
      } else if (
        message.includes('não está ativa') ||
        message.includes('manutenção')
      ) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
      }
    }

    this.logger.error(`Erro capturado: ${message}`, exception);

    response.status(status).json({
      success: false,
      error: {
        type:
          exception instanceof Error
            ? exception.constructor.name
            : 'UnknownError',
        message,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
