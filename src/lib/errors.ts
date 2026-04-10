export class AppError extends Error {
  statusCode: number;
  code: string;
  fieldErrors?: Record<string, string>;

  constructor(options: {
    statusCode: number;
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
  }) {
    super(options.message);
    this.name = 'AppError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.fieldErrors = options.fieldErrors;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError({
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Something went wrong while processing the request.'
  });
}
