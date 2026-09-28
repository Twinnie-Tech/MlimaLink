/** In-memory stand-in for the ioredis commands the auth-service uses, for tests. */
export function createFakeRedis() {
  const strings = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const ttls = new Map<string, number>();

  const commands = {
    async get(key: string) {
      return strings.get(key) ?? null;
    },
    async set(key: string, value: string, mode?: 'EX', seconds?: number) {
      strings.set(key, value);
      if (mode === 'EX' && seconds) ttls.set(key, seconds);
      return 'OK';
    },
    async del(...keys: string[]) {
      let removed = 0;
      for (const key of keys) {
        if (strings.delete(key) || sets.delete(key)) removed++;
        ttls.delete(key);
      }
      return removed;
    },
    async incr(key: string) {
      const next = Number(strings.get(key) ?? 0) + 1;
      strings.set(key, String(next));
      return next;
    },
    async sadd(key: string, ...members: string[]) {
      const set = sets.get(key) ?? new Set<string>();
      members.forEach((member) => set.add(member));
      sets.set(key, set);
      return members.length;
    },
    async srem(key: string, ...members: string[]) {
      const set = sets.get(key);
      return members.filter((member) => set?.delete(member)).length;
    },
    async smembers(key: string) {
      return [...(sets.get(key) ?? [])];
    },
    async expire(key: string, seconds: number) {
      if (!strings.has(key) && !sets.has(key)) return 0;
      ttls.set(key, seconds);
      return 1;
    },
  };

  type Command = keyof typeof commands;

  function multi() {
    const queued: Array<() => Promise<unknown>> = [];
    const chain = {
      async exec() {
        const results: Array<[null, unknown]> = [];
        for (const run of queued) results.push([null, await run()]);
        return results;
      },
    } as Record<Command, (...args: unknown[]) => typeof chain> & {
      exec: () => Promise<Array<[null, unknown]>>;
    };
    for (const name of Object.keys(commands) as Command[]) {
      chain[name] = (...args: unknown[]) => {
        queued.push(() =>
          (commands[name] as (...commandArgs: unknown[]) => Promise<unknown>)(
            ...args,
          ),
        );
        return chain;
      };
    }
    return chain;
  }

  return {
    ...commands,
    multi,
    status: 'ready',
    strings,
    sets,
    ttls,
    reset() {
      strings.clear();
      sets.clear();
      ttls.clear();
    },
  };
}

export type FakeRedis = ReturnType<typeof createFakeRedis>;
