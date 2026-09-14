/**
 * The Ruby code signalled failure two ways: `context.fail!(error:)` inside an
 * Interactor, and `redirect_to … alert:` inside a controller. Both become
 * exceptions here; the Fastify error handler turns them into the JSON shape the
 * SPA expects (message plus optional redirect), so the flash/redirect behaviour
 * of every original action is preserved.
 */

export class AppError extends Error {
  readonly statusCode: number;
  readonly redirect?: string;
  readonly flashType: 'alert' | 'notice' | 'success' | 'danger';
  readonly details?: Record<string, string[]>;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      redirect?: string;
      flashType?: 'alert' | 'notice' | 'success' | 'danger';
      details?: Record<string, string[]>;
    } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = options.statusCode ?? 400;
    this.redirect = options.redirect;
    this.flashType = options.flashType ?? 'alert';
    this.details = options.details;
  }
}

/** Equivalent of `context.fail!(error: …)`; carries the interactor's extra keys. */
export class InteractorFailure extends AppError {
  readonly failureStatus?: string;
  readonly extra: Record<string, unknown>;

  constructor(message: string, extra: Record<string, unknown> = {}) {
    super(message, { statusCode: 400 });
    this.name = 'InteractorFailure';
    this.failureStatus = typeof extra.failureStatus === 'string' ? extra.failureStatus : undefined;
    this.extra = extra;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, { statusCode: 404 });
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'ログインして下さい') {
    super(message, { statusCode: 401 });
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = '権利がありません', redirect?: string) {
    super(message, { statusCode: 403, redirect });
    this.name = 'ForbiddenError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, string[]>) {
    super(message, { statusCode: 422, details });
    this.name = 'ValidationError';
  }
}

/** User::NotEnoughCreditsError */
export class NotEnoughCreditsError extends AppError {
  constructor(message: string) {
    super(message, { statusCode: 422 });
    this.name = 'NotEnoughCreditsError';
  }
}

/** ApplicationController::SNSApiError */
export class SNSApiError extends AppError {
  constructor(message: string) {
    super(message, { statusCode: 400 });
    this.name = 'SNSApiError';
  }
}

/** MeetingsController::OrderValidationError */
export class OrderValidationError extends AppError {
  constructor(message: string) {
    super(message, { statusCode: 422 });
    this.name = 'OrderValidationError';
  }
}
