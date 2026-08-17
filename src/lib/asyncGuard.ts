export const ACTION_TIMEOUT = 25_000;

export async function withTimeout<T>(work: Promise<T>, ms: number = ACTION_TIMEOUT): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function failureMessage(error: unknown) {
  if (error instanceof Error && error.message === 'timeout') {
    return 'That took too long. Roblox may be slow or unreachable, so nothing was saved.';
  }
  return 'Something went wrong inside the app while handling that. Nothing was saved.';
}

export type Guarded<T> = { ok: true; data: T } | { ok: false; reason: string };

export async function guard<T>(
  work: () => Promise<Guarded<T>>,
  hooks: { onStart: () => void; onEnd: () => void },
  ms: number = ACTION_TIMEOUT
): Promise<Guarded<T>> {
  hooks.onStart();
  try {
    return await withTimeout(work(), ms);
  } catch (error) {
    return { ok: false, reason: failureMessage(error) };
  } finally {
    hooks.onEnd();
  }
}
