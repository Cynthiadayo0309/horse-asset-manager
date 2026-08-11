import { zodResolver } from '@hookform/resolvers/zod';
import {
  loginSchema,
  registerSchema,
  setupSchema,
  type LoginInput,
  type RegisterInput,
  type SetupInput,
} from '@horse-asset-manager/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/feedback';
import { Field, Input } from '@/components/form';
import { postJson } from '@/lib/api';
import type { User } from '@/types';

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  return (
    <main className="grid min-h-screen grid-cols-1 bg-emerald-950 text-white lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative flex min-h-[19rem] flex-col justify-between overflow-hidden p-6 sm:p-8 lg:min-h-screen lg:p-12">
        <div className="relative z-10 flex items-center gap-3 font-semibold">
          <img className="size-10" src="/brand/brand-mark.svg" alt="" />
          Horse Asset Manager
        </div>
        <div className="relative z-10 max-w-xl">
          <p className="mb-4 text-sm font-semibold tracking-[0.18em] text-emerald-300">
            一口馬主のための資金管理
          </p>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
            出資前から精算まで、
            <br />
            お金の流れを見通す。
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-emerald-100/80">
            毎月の支出、分配金、予算、出資可能額をひとつの画面で管理できます。競馬予想ではなく、資金計画に集中したサービスです。
          </p>
        </div>
        <img
          className="pointer-events-none absolute -bottom-14 right-0 h-72 opacity-[0.09] brightness-[2.6] sepia sm:h-[22rem] lg:-bottom-8 lg:right-4 lg:h-[25rem]"
          src="/brand/ham-mascot.png"
          alt=""
        />
        <div className="relative z-10 flex items-center gap-2 text-sm text-emerald-100/70">
          <ShieldCheck className="size-4" />
          利用者ごとにデータを分離して保存します
        </div>
      </section>
      <section className="grid place-items-center bg-background p-4 text-foreground sm:p-8 lg:p-10">
        <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl sm:p-8">
          <div className="mb-6 flex rounded-lg bg-muted p-1">
            <button
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${mode === 'login' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
              onClick={() => setMode('login')}
            >
              ログイン
            </button>
            <button
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${mode === 'register' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
              onClick={() => setMode('register')}
            >
              新規登録
            </button>
          </div>
          {mode === 'login' ? <LoginForm /> : <RegisterForm />}
        </div>
      </section>
    </main>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const mutation = useMutation({
    mutationFn: (value: LoginInput) => postJson<User>('/api/auth/login', value),
    onSuccess: async (user) => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate(user.setupCompleted ? '/dashboard' : '/setup');
    },
  });
  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit((value) => mutation.mutate(value))}>
      <div>
        <h2 className="text-xl font-bold">おかえりなさい</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          登録したメールアドレスでログインします。
        </p>
      </div>
      {mutation.error ? <ErrorState error={mutation.error} /> : null}
      <Field label="メールアドレス" error={form.formState.errors.email?.message}>
        <Input type="email" autoComplete="email" {...form.register('email')} />
      </Field>
      <Field label="パスワード" error={form.formState.errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...form.register('password')} />
      </Field>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'ログイン中…' : 'ログイン'}
      </Button>
    </form>
  );
}

function RegisterForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', name: '', password: '' },
  });
  const mutation = useMutation({
    mutationFn: (value: RegisterInput) => postJson<User>('/api/auth/register', value),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate('/setup');
    },
  });
  return (
    <form className="grid gap-4" onSubmit={form.handleSubmit((value) => mutation.mutate(value))}>
      <div>
        <h2 className="text-xl font-bold">資金管理を始める</h2>
        <p className="mt-1 text-sm text-muted-foreground">dev環境用の利用者を作成します。</p>
      </div>
      {mutation.error ? <ErrorState error={mutation.error} /> : null}
      <Field label="表示名" error={form.formState.errors.name?.message}>
        <Input autoComplete="name" {...form.register('name')} />
      </Field>
      <Field label="メールアドレス" error={form.formState.errors.email?.message}>
        <Input type="email" autoComplete="email" {...form.register('email')} />
      </Field>
      <Field label="パスワード（12文字以上）" error={form.formState.errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...form.register('password')} />
      </Field>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? '登録中…' : '新規登録'}
      </Button>
    </form>
  );
}

export function SetupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const month = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'Asia/Tokyo',
  })
    .format(new Date())
    .slice(0, 7);
  const form = useForm<SetupInput>({
    resolver: zodResolver(setupSchema),
    defaultValues: { yearlyBudgetYen: 600_000, monthlyBudgetYen: 50_000, clubName: '' },
  });
  const mutation = useMutation({
    mutationFn: (value: SetupInput) => postJson('/api/setup', value),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      navigate('/dashboard');
    },
  });
  return (
    <main className="grid min-h-screen place-items-center bg-muted/40 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
        <p className="text-sm font-semibold text-primary">初期設定</p>
        <h1 className="mt-2 text-2xl font-bold">最初の予算を設定しましょう</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {month}から利用する年間・月間予算です。後からいつでも変更できます。
        </p>
        <form
          className="mt-7 grid grid-cols-1 gap-5 sm:grid-cols-2"
          onSubmit={form.handleSubmit((value) => mutation.mutate(value))}
        >
          {mutation.error ? (
            <div className="sm:col-span-2">
              <ErrorState error={mutation.error} />
            </div>
          ) : null}
          <Field label="年間予算（円）" error={form.formState.errors.yearlyBudgetYen?.message}>
            <Input
              type="number"
              min="0"
              {...form.register('yearlyBudgetYen', { valueAsNumber: true })}
            />
          </Field>
          <Field label="月間予算（円）" error={form.formState.errors.monthlyBudgetYen?.message}>
            <Input
              type="number"
              min="0"
              {...form.register('monthlyBudgetYen', { valueAsNumber: true })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="利用中のクラブ（任意）" error={form.formState.errors.clubName?.message}>
              <Input placeholder="例：○○サラブレッドクラブ" {...form.register('clubName')} />
            </Field>
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '保存中…' : '設定を保存して開始'}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
