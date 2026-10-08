export async function requestCompletionPrint(
  lock: { current: boolean },
  request: () => Promise<unknown>,
  callbacks: { pending: (value: boolean) => void; error: (value: string) => void; accepted: () => void },
) {
  if (lock.current) return false;
  lock.current = true;
  callbacks.pending(true);
  callbacks.error('');
  try {
    await request();
    callbacks.accepted();
    return true;
  } catch (error) {
    callbacks.error(error instanceof Error ? error.message : 'Unable to request printing.');
    return false;
  } finally {
    lock.current = false;
    callbacks.pending(false);
  }
}
