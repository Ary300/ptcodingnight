/**
 * Typed domain errors, mapped to HTTP at the route edge and nowhere else (CLAUDE.md).
 * Throwing these keeps route handlers thin: they validate, delegate, and let the edge
 * translate. No catch block anywhere may swallow one silently.
 */

export type DomainErrorCode =
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT"
  | "CONTEST_NOT_RUNNING"
  | "PROBLEM_IS_DRAFT"
  | "RATE_LIMITED"
  | "INTERNAL";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  /** Safe to show a student. Never include hidden test data or internal detail. */
  readonly publicMessage: string;

  constructor(code: DomainErrorCode, publicMessage: string, options?: { cause?: unknown }) {
    super(publicMessage, options);
    this.name = "DomainError";
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

export class NotFoundError extends DomainError {
  constructor(what: string) {
    super("NOT_FOUND", `${what} not found`);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You do not have access to this") {
    super("FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super("VALIDATION", message);
    this.name = "ValidationError";
  }
}

/**
 * A DRAFT problem may not appear in a live contest. Enforced in the API, not just the UI
 * (docs/PRD.md §8) — the UI check is the one that gets bypassed.
 */
export class DraftProblemError extends DomainError {
  constructor(slug: string) {
    super("PROBLEM_IS_DRAFT", `Problem "${slug}" is still a draft and cannot be used live`);
    this.name = "DraftProblemError";
  }
}

const STATUS_BY_CODE: Readonly<Record<DomainErrorCode, number>> = {
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  VALIDATION: 400,
  CONFLICT: 409,
  CONTEST_NOT_RUNNING: 409,
  PROBLEM_IS_DRAFT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export function httpStatusFor(error: DomainError): number {
  return STATUS_BY_CODE[error.code];
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
