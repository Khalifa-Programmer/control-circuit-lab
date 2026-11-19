/** The message of a refusal from a server function, for a toast or an alert. */
export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "That didn't work. Try again.";
}

/** Whether a server function refused because the object isn't the person's (or doesn't exist). */
export function isNotFound(error: unknown): boolean {
  return error instanceof Error && / not found$/.test(error.message);
}
