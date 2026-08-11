import { app } from './app';
import { runDailyMaintenance } from './services/alerts';
import type { Env } from './types';

const worker: ExportedHandler<Env> = {
  fetch: app.fetch,
  async scheduled(_controller, env, context) {
    context.waitUntil(runDailyMaintenance(env).then(() => undefined));
  },
};

export default worker;
export { app };
export type { Env };
