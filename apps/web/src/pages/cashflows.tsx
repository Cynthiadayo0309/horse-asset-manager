import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatYen } from '@horse-asset-manager/shared';
import { Archive, CheckCircle2, FileUp, Plus, RefreshCw } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { Field, Input, Select, Textarea } from '@/components/form';
import { PageHeader, Panel, StatusBadge } from '@/components/page';
import { Button } from '@/components/ui/button';
import {
  apiList,
  apiRequest,
  currentDate,
  currentMonth,
  deleteRequest,
  patchJson,
  postJson,
} from '@/lib/api';
import type {
  Cashflow,
  Category,
  Club,
  Horse,
  Reconciliation,
  RecurringRule,
  ScheduledCashflow,
} from '@/types';

export function CashflowsPage() {
  const client = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [open, setOpen] = useState(false);
  const cashflows = useQuery({
    queryKey: ['cashflows', month],
    queryFn: () => apiList<Cashflow>(`/api/cashflows?targetMonth=${month}&pageSize=100`),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiRequest<Category[]>('/api/categories'),
  });
  const horses = useQuery({
    queryKey: ['horses', 'all'],
    queryFn: () => apiList<Horse>('/api/horses?pageSize=100'),
  });
  const clubs = useQuery({
    queryKey: ['clubs'],
    queryFn: () => apiList<Club>('/api/clubs?pageSize=100'),
  });
  const create = useMutation({
    mutationFn: (body: unknown) => postJson('/api/cashflows', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['cashflows'] });
      void client.invalidateQueries({ queryKey: ['dashboard'] });
      setOpen(false);
    },
  });
  const archive = useMutation({
    mutationFn: (id: number) => deleteRequest(`/api/cashflows/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['cashflows'] }),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const optionalId = (key: string) => (f.get(key) ? Number(f.get(key)) : null);
    create.mutate({
      horseId: optionalId('horseId'),
      clubId: optionalId('clubId'),
      categoryId: Number(f.get('categoryId')),
      direction: f.get('direction'),
      title: f.get('title'),
      amountYen: Number(f.get('amountYen')),
      occurredOn: f.get('occurredOn'),
      targetMonth: f.get('targetMonth'),
      paymentMethod: null,
      note: f.get('note') || null,
      scheduledCashflowId: null,
    });
  }
  const rows = cashflows.data?.data ?? [];
  return (
    <div className="grid gap-6">
      <PageHeader
        title="収支管理"
        description="実際に支払った・受け取った金額を記録します。ここに確定登録した金額だけが集計されます。"
        actions={
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <Input
              aria-label="対象年月"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
            <Button onClick={() => setOpen((value) => !value)}>
              <Plus />
              収支を登録
            </Button>
            <Button asChild variant="outline">
              <Link to="/cashflows/import">
                <FileUp />
                PDFを取り込む
              </Link>
            </Button>
          </div>
        }
      />
      {open ? (
        <Panel title="確定収支の登録">
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
            <Field label="支出・入金">
              <Select name="direction" defaultValue="expense">
                <option value="expense">支出</option>
                <option value="income">入金</option>
              </Select>
            </Field>
            <Field label="内容">
              <Input name="title" required />
            </Field>
            <Field label="金額（円）">
              <Input name="amountYen" type="number" min="0" required />
            </Field>
            <Field label="カテゴリー">
              <Select name="categoryId" required>
                <option value="">選択してください</option>
                {categories.data?.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}（{category.categoryType === 'expense' ? '支出' : '入金'}）
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="発生日">
              <Input name="occurredOn" type="date" defaultValue={currentDate()} required />
            </Field>
            <Field label="対象年月">
              <Input name="targetMonth" type="month" defaultValue={month} required />
            </Field>
            <Field label="馬">
              <Select name="horseId">
                <option value="">共通</option>
                {horses.data?.data.map((horse) => (
                  <option key={horse.id} value={horse.id}>
                    {horse.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="クラブ">
              <Select name="clubId">
                <option value="">未設定</option>
                {clubs.data?.data.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="メモ">
              <Textarea name="note" />
            </Field>
            <div className="flex items-end">
              <Button className="w-full xl:w-auto" disabled={create.isPending} type="submit">
                確定して保存
              </Button>
            </div>
          </form>
          {create.error ? <ErrorState error={create.error} /> : null}
        </Panel>
      ) : null}
      {cashflows.isLoading ? (
        <LoadingState />
      ) : cashflows.error ? (
        <ErrorState error={cashflows.error} />
      ) : rows.length === 0 ? (
        <EmptyState>{month}の収支はまだありません。</EmptyState>
      ) : (
        <Panel>
          <div className="grid gap-3 md:hidden">
            {rows.map((row) => (
              <article key={row.id} className="grid gap-3 rounded-lg border p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{row.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{row.occurredOn}</p>
                  </div>
                  <StatusBadge tone={row.direction === 'income' ? 'success' : 'neutral'}>
                    {row.direction === 'expense' ? '支出' : '入金'}
                  </StatusBadge>
                </div>
                <dl className="grid gap-2">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">カテゴリー</dt>
                    <dd className="text-right">
                      {categories.data?.find((item) => item.id === row.categoryId)?.name ?? '-'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">金額</dt>
                    <dd className="font-semibold tabular-nums">{formatYen(row.amountYen)}</dd>
                  </div>
                </dl>
                <Button
                  className="w-full justify-center text-red-700 hover:bg-red-50 hover:text-red-800"
                  variant="ghost"
                  onClick={() => archive.mutate(row.id)}
                >
                  <Archive className="size-4" />
                  保管する
                </Button>
              </article>
            ))}
          </div>
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2">発生日</th>
                  <th>内容</th>
                  <th>区分</th>
                  <th>カテゴリー</th>
                  <th className="text-right">金額</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="py-3">{row.occurredOn}</td>
                    <td className="font-medium">{row.title}</td>
                    <td>
                      <StatusBadge tone={row.direction === 'income' ? 'success' : 'neutral'}>
                        {row.direction === 'expense' ? '支出' : '入金'}
                      </StatusBadge>
                    </td>
                    <td>
                      {categories.data?.find((item) => item.id === row.categoryId)?.name ?? '-'}
                    </td>
                    <td className="text-right font-semibold tabular-nums">
                      {formatYen(row.amountYen)}
                    </td>
                    <td className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="保管する"
                        onClick={() => archive.mutate(row.id)}
                      >
                        <Archive className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

export function SchedulePage() {
  const client = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [mode, setMode] = useState<'schedule' | 'rules'>('schedule');
  const scheduled = useQuery({
    queryKey: ['scheduled', month],
    queryFn: () =>
      apiList<ScheduledCashflow>(`/api/scheduled-cashflows?targetMonth=${month}&pageSize=100`),
  });
  const rules = useQuery({
    queryKey: ['recurring-rules'],
    queryFn: () => apiList<RecurringRule>('/api/recurring-rules?pageSize=100'),
  });
  const reconciliations = useQuery({
    queryKey: ['reconciliations'],
    queryFn: () => apiList<Reconciliation>('/api/reconciliations?pageSize=100'),
  });
  const actuals = useQuery({
    queryKey: ['cashflows', month, 'reconciliation-candidates'],
    queryFn: () => apiList<Cashflow>(`/api/cashflows?targetMonth=${month}&pageSize=100`),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiRequest<Category[]>('/api/categories'),
  });
  const createRule = useMutation({
    mutationFn: (body: unknown) => postJson('/api/recurring-rules', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['recurring-rules'] });
      void client.invalidateQueries({ queryKey: ['scheduled'] });
    },
  });
  const createScheduled = useMutation({
    mutationFn: (body: unknown) => postJson('/api/scheduled-cashflows', body),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['scheduled'] }),
  });
  const confirm = useMutation({
    mutationFn: (item: ScheduledCashflow) =>
      postJson('/api/cashflows', {
        horseId: item.horseId,
        clubId: item.clubId,
        categoryId: item.categoryId,
        direction: item.direction,
        title: item.title,
        amountYen: item.amountYen,
        occurredOn: currentDate(),
        targetMonth: item.targetMonth,
        paymentMethod: null,
        note: null,
        scheduledCashflowId: item.id,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['scheduled'] });
      void client.invalidateQueries({ queryKey: ['cashflows'] });
      void client.invalidateQueries({ queryKey: ['reconciliations'] });
    },
  });
  const generate = useMutation({
    mutationFn: () => postJson('/api/recurring-rules/generate', {}),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['scheduled'] }),
  });
  const autoMatch = useMutation({
    mutationFn: () => postJson(`/api/reconciliations/auto-match?targetMonth=${month}`, {}),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['reconciliations'] });
      void client.invalidateQueries({ queryKey: ['scheduled'] });
    },
  });
  const resolve = useMutation({
    mutationFn: (id: number) => patchJson(`/api/reconciliations/${id}`, { status: 'resolved' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['reconciliations'] }),
  });
  const manualMatch = useMutation({
    mutationFn: (value: { scheduledCashflowId: number; cashflowId: number; reason: string }) =>
      postJson('/api/reconciliations', value),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['reconciliations'] });
      void client.invalidateQueries({ queryKey: ['scheduled'] });
    },
  });
  const unlink = useMutation({
    mutationFn: (id: number) => deleteRequest(`/api/reconciliations/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['reconciliations'] });
      void client.invalidateQueries({ queryKey: ['scheduled'] });
    },
  });
  function scheduledSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    createScheduled.mutate({
      horseId: null,
      clubId: null,
      categoryId: Number(f.get('categoryId')),
      direction: f.get('direction'),
      title: f.get('title'),
      amountYen: Number(f.get('amountYen')),
      dueOn: f.get('dueOn'),
      targetMonth: String(f.get('dueOn')).slice(0, 7),
      note: null,
    });
  }
  function ruleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    createRule.mutate({
      horseId: null,
      clubId: null,
      categoryId: Number(f.get('categoryId')),
      direction: 'expense',
      title: f.get('title'),
      amountYen: Number(f.get('amountYen')),
      frequency: f.get('frequency'),
      dayOfMonth: Number(f.get('dayOfMonth')),
      startMonth: f.get('startMonth'),
      endMonth: null,
      note: null,
    });
  }
  const reconciledScheduledIds = new Set(
    reconciliations.data?.data.flatMap((item) =>
      item.scheduledCashflowId == null ? [] : [item.scheduledCashflowId],
    ) ?? [],
  );
  const reconciledCashflowIds = new Set(
    reconciliations.data?.data.flatMap((item) =>
      item.cashflowId == null ? [] : [item.cashflowId],
    ) ?? [],
  );
  const candidatePairs =
    scheduled.data?.data
      .filter(
        (item) =>
          ['planned', 'overdue'].includes(item.status) && !reconciledScheduledIds.has(item.id),
      )
      .flatMap((planned) => {
        const actual = actuals.data?.data
          .filter(
            (item) => item.direction === planned.direction && !reconciledCashflowIds.has(item.id),
          )
          .sort((left, right) => {
            const amountOrder =
              Math.abs(left.amountYen - planned.amountYen) -
              Math.abs(right.amountYen - planned.amountYen);
            if (amountOrder !== 0) return amountOrder;
            return (
              Math.abs(Date.parse(left.occurredOn) - Date.parse(planned.dueOn)) -
              Math.abs(Date.parse(right.occurredOn) - Date.parse(planned.dueOn))
            );
          })[0];
        if (!actual) return [];
        const dayDifference = Math.round(
          Math.abs(Date.parse(actual.occurredOn) - Date.parse(planned.dueOn)) / 86_400_000,
        );
        return [
          {
            planned,
            actual,
            differenceYen: actual.amountYen - planned.amountYen,
            reason: `${actual.amountYen === planned.amountYen ? '同額' : '金額差あり'}・日付差${dayDifference}日`,
          },
        ];
      }) ?? [];
  return (
    <div className="grid gap-6">
      <PageHeader
        title="支払い予定"
        description="未来の支払いと入金を管理します。支払った後に確定収支へ登録すると二重計上を防げます。"
        actions={
          <div className="flex gap-2">
            <Button
              variant={mode === 'schedule' ? 'default' : 'outline'}
              onClick={() => setMode('schedule')}
            >
              予定
            </Button>
            <Button
              variant={mode === 'rules' ? 'default' : 'outline'}
              onClick={() => setMode('rules')}
            >
              定期ルール
            </Button>
          </div>
        }
      />
      {mode === 'schedule' ? (
        <>
          <Panel title="単発予定を追加">
            <form
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6"
              onSubmit={scheduledSubmit}
            >
              <Select name="direction">
                <option value="expense">支出</option>
                <option value="income">入金</option>
              </Select>
              <Input name="title" placeholder="内容" required />
              <Input name="amountYen" type="number" min="0" placeholder="金額" required />
              <Select name="categoryId" required>
                <option value="">カテゴリー</option>
                {categories.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <Input name="dueOn" type="date" defaultValue={currentDate()} required />
              <Button type="submit">追加</Button>
            </form>
          </Panel>
          <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
            <Input
              className="sm:w-44"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
            <Button variant="outline" onClick={() => generate.mutate()}>
              <RefreshCw />
              12か月分を補充
            </Button>
          </div>
          {scheduled.isLoading ? (
            <LoadingState />
          ) : scheduled.data?.data.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {scheduled.data.data.map((item) => (
                <Panel key={item.id}>
                  <div className="flex justify-between">
                    <StatusBadge
                      tone={
                        item.status === 'overdue'
                          ? 'danger'
                          : item.status === 'paid'
                            ? 'success'
                            : 'warning'
                      }
                    >
                      {item.status === 'planned'
                        ? '未払い'
                        : item.status === 'overdue'
                          ? '期限超過'
                          : item.status === 'paid'
                            ? '支払済み'
                            : '取消'}
                    </StatusBadge>
                    <span className="text-sm">{item.dueOn}</span>
                  </div>
                  <p className="mt-4 font-semibold">{item.title}</p>
                  <p className="mt-1 text-xl font-bold">{formatYen(item.amountYen)}</p>
                  {['planned', 'overdue'].includes(item.status) ? (
                    <Button
                      className="mt-4 w-full"
                      variant="outline"
                      onClick={() => confirm.mutate(item)}
                    >
                      <CheckCircle2 />
                      実績として確定
                    </Button>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : (
            <EmptyState>この月の予定はありません。</EmptyState>
          )}
        </>
      ) : (
        <>
          <Panel title="定期ルールを追加">
            <form
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6"
              onSubmit={ruleSubmit}
            >
              <Input name="title" placeholder="例：月会費" required />
              <Input name="amountYen" type="number" min="0" placeholder="金額" required />
              <Select name="categoryId" required>
                <option value="">カテゴリー</option>
                {categories.data
                  ?.filter((item) => item.categoryType === 'expense')
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </Select>
              <Select name="frequency">
                <option value="monthly">毎月</option>
                <option value="yearly">毎年</option>
                <option value="once">1回だけ</option>
              </Select>
              <Input name="dayOfMonth" type="number" min="1" max="31" defaultValue="27" />
              <Input name="startMonth" type="month" defaultValue={month} />
              <Button type="submit">ルール作成</Button>
            </form>
          </Panel>
          {rules.data?.data.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rules.data.data.map((rule) => (
                <Panel key={rule.id}>
                  <p className="font-semibold">{rule.title}</p>
                  <p className="mt-2 text-xl">{formatYen(rule.amountYen)}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {rule.frequency === 'monthly'
                      ? '毎月'
                      : rule.frequency === 'yearly'
                        ? '毎年'
                        : '1回'}
                    ・{rule.dayOfMonth}日
                  </p>
                </Panel>
              ))}
            </div>
          ) : (
            <EmptyState>定期ルールはまだありません。</EmptyState>
          )}
        </>
      )}
      <Panel title="予定と実績の照合">
        <div className="mb-4 grid gap-3 sm:flex sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            同額・同区分・日付±7日の候補が1件だけの場合に自動照合します。
          </p>
          <Button variant="outline" onClick={() => autoMatch.mutate()}>
            今月を自動照合
          </Button>
        </div>
        {manualMatch.error || unlink.error ? (
          <div className="mb-4">
            <ErrorState error={manualMatch.error ?? unlink.error} />
          </div>
        ) : null}
        {candidatePairs.length ? (
          <div className="mb-6 grid gap-3">
            <h3 className="font-semibold">今月の未照合候補</h3>
            {candidatePairs.map(({ planned, actual, differenceYen, reason }) => (
              <div key={`${planned.id}:${actual.id}`} className="rounded-lg border p-4 text-sm">
                <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto] lg:items-center">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">予定</p>
                    <p className="font-medium">{planned.title}</p>
                    <p>
                      {planned.dueOn}・{formatYen(planned.amountYen)}
                    </p>
                  </div>
                  <span aria-hidden="true">↔</span>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">実績</p>
                    <p className="font-medium">{actual.title}</p>
                    <p>
                      {actual.occurredOn}・{formatYen(actual.amountYen)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={manualMatch.isPending}
                    onClick={() =>
                      manualMatch.mutate({
                        scheduledCashflowId: planned.id,
                        cashflowId: actual.id,
                        reason,
                      })
                    }
                  >
                    この組み合わせで照合
                  </Button>
                </div>
                <p className="mt-3 text-muted-foreground">
                  判定理由：{reason}・差額 {formatYen(differenceYen)}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        {reconciliations.data?.data.length ? (
          <div className="grid gap-2">
            {reconciliations.data.data.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 rounded border p-3 text-sm sm:flex sm:items-center sm:justify-between"
              >
                <div>
                  <p>
                    予定：{item.scheduledTitle ?? `#${item.scheduledCashflowId ?? '-'}`}
                    {item.scheduledDueOn ? `（${item.scheduledDueOn}）` : ''}
                  </p>
                  <p>
                    実績：{item.actualTitle ?? `#${item.cashflowId ?? '-'}`}
                    {item.actualOccurredOn ? `（${item.actualOccurredOn}）` : ''}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    差額 {formatYen(item.differenceYen ?? 0)}・判定理由：
                    {item.reason ?? (item.matchType === 'exact' ? '同額・日付条件一致' : '要確認')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {item.status === 'open' ? (
                    <Button size="sm" variant="ghost" onClick={() => resolve.mutate(item.id)}>
                      確認済み
                    </Button>
                  ) : (
                    <StatusBadge tone="success">確認済み</StatusBadge>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={unlink.isPending}
                    onClick={() => unlink.mutate(item.id)}
                  >
                    照合を解除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>照合履歴はまだありません。</EmptyState>
        )}
      </Panel>
    </div>
  );
}
