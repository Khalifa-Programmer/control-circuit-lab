/** A refusal the person can read, with the HTTP status the API answers. */
export class AppError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, `${what} not found`);
