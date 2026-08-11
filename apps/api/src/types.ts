export interface Env {
  APP_ENV: 'local' | 'dev' | 'prod';
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
  };
};
