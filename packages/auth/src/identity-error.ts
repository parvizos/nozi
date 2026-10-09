export class IdentityError extends Error {
  readonly code: string;
  readonly status: 400 | 403 | 409 | 410 | 422 | 429;

  constructor(
    code: string,
    message: string,
    status: 400 | 403 | 409 | 410 | 422 | 429,
  ) {
    super(message);
    this.name = "IdentityError";
    this.code = code;
    this.status = status;
  }
}
