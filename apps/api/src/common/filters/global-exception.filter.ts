import { randomUUID } from 'node:crypto';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorResponse } from '@rental/shared';
import { getApplicationError } from '../errors/application-exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = randomUUID();
    const path = request.path;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const applicationError = getApplicationError(exception);
    let message = status >= 500 ? 'Internal server error' : 'Request failed';
    let code = status >= 500 ? 'INTERNAL_ERROR' : `HTTP_${status}`;
    let errors: string[] | undefined;
    if (applicationError) {
      code = applicationError.code;
      message = applicationError.definition.message;
    } else if (status < 500 && typeof body === 'string') {
      message = body;
    } else if (status < 500 && body && typeof body === 'object' && 'message' in body) {
      const detail = body.message;
      if (Array.isArray(detail)) {
        code = 'VALIDATION_ERROR';
        message = 'Validation failed';
        errors = detail.filter((item): item is string => typeof item === 'string');
      } else if (typeof detail === 'string') {
        message = detail;
      }
    }
    if (status >= 500) {
      // Never serialize arbitrary exception messages, query parameters or database credentials.
      this.logger.error(`HTTP ${status}; requestId=${requestId}`);
    }
    if (status === HttpStatus.NOT_FOUND) message = 'Not Found';
    const result: ApiErrorResponse = {
      statusCode: status,
      code,
      message,
      ...(errors ? { errors } : {}),
      path,
      timestamp: new Date().toISOString(),
      requestId,
    };
    response.setHeader('X-Request-Id', requestId);
    response.status(status).json(result);
  }
}
