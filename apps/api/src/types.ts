export interface Env {
  APP_ENV: 'local' | 'dev' | 'prod';
  ALLOW_REGISTRATION: 'true' | 'false';
  DB: D1Database;
  ASSETS?: Fetcher;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  setupCompleted: boolean;
}

export type AppBindings = {
  Bindings: Env;
  Variables: {
    user: AuthUser;
    requestId: string;
  };
};
