// Historical audits must not block the current roster and recommendations.
export function backgroundReport<T>(
  load: () => Promise<T>,
  ttl = 15 * 60_000,
  now = Date.now,
) {
  let value: T | null = null;
  let updatedAt: string | null = null;
  let pending = false;
  let nextAt = 0;
  let error: string | null = null;
  return () => {
    if (!pending && now() >= nextAt) {
      pending = true;
      void Promise.resolve()
        .then(load)
        .then(
          (result) => {
            value = result;
            updatedAt = new Date(now()).toISOString();
            error = null;
            nextAt = now() + ttl;
          },
          () => {
            error =
              "Historical scorecard is temporarily unavailable. Retrying automatically.";
            nextAt = now() + 60_000;
          },
        )
        .finally(() => {
          pending = false;
        });
    }
    return { value, updatedAt, pending, error };
  };
}
