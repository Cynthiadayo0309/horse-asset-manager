import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatYen } from '@horse-asset-manager/shared';
import { useState, type FormEvent } from 'react';

import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { Field, Input, Textarea } from '@/components/form';
import { MetricCard, PageHeader, Panel } from '@/components/page';
import { Button } from '@/components/ui/button';
import { apiRequest, currentMonth, postJson } from '@/lib/api';
import type { Budget, SimulationScenario } from '@/types';

interface BudgetSummary {
  budgetYen: number | null;
  actualExpenseYen: number;
  outstandingScheduledExpenseYen: number;
  projectedExpenseYen: number;
  remainingBudgetYen: number | null;
  availableInvestmentYen: number | null;
  usageRate: number | null;
  isOverBudget: boolean;
}
interface SimulationResult {
  periodTotalYen: number;
  firstYearTotalYen: number;
  annualBudgetYen: number | null;
  remainingBudgetYen: number | null;
  isOverBudget: boolean;
}

export function BudgetsPage() {
  const client = useQueryClient();
  const [year, setYear] = useState(currentMonth().slice(0, 4));
  const budgets = useQuery({
    queryKey: ['budgets', year],
    queryFn: () => apiRequest<Budget[]>(`/api/budgets?year=${year}`),
  });
  const summary = useQuery({
    queryKey: ['available-budget', year],
    queryFn: () => apiRequest<BudgetSummary>(`/api/budgets/available-investment?year=${year}`),
  });
  const save = useMutation({
    mutationFn: (body: unknown) => postJson('/api/budgets', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['budgets'] });
      void client.invalidateQueries({ queryKey: ['available-budget'] });
      void client.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    save.mutate({
      budgetType: f.get('budgetType'),
      periodKey: f.get('periodKey'),
      amountYen: Number(f.get('amountYen')),
      note: null,
    });
  }
  return (
    <div className="grid gap-6">
      <PageHeader
        title="予算"
        description="入金を差し引かず、確定支出と未払い予定から保守的に出資余力を計算します。"
        actions={
          <Input
            className="sm:w-32"
            type="number"
            value={year}
            onChange={(event) => setYear(event.target.value)}
          />
        }
      />
      {summary.isLoading ? (
        <LoadingState />
      ) : summary.error ? (
        <ErrorState error={summary.error} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="年間予算" value={summary.data?.budgetYen ?? null} />
          <MetricCard label="確定支出" value={summary.data?.actualExpenseYen ?? 0} />
          <MetricCard
            label="未払い予定"
            value={summary.data?.outstandingScheduledExpenseYen ?? 0}
          />
          <MetricCard
            label="出資可能額の目安"
            value={summary.data?.availableInvestmentYen ?? null}
            tone={summary.data?.isOverBudget ? 'warning' : 'default'}
          />
        </div>
      )}
      <Panel title="予算を設定">
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
          <Field label="予算の種類">
            <select className="h-10 rounded-md border bg-background px-3" name="budgetType">
              <option value="yearly">年間</option>
              <option value="monthly">月間</option>
            </select>
          </Field>
          <Field label="対象期間">
            <Input
              name="periodKey"
              defaultValue={year}
              placeholder="YYYY または YYYY-MM"
              required
            />
          </Field>
          <Field label="金額（円）">
            <Input name="amountYen" type="number" min="0" required />
          </Field>
          <div className="flex items-end">
            <Button className="w-full xl:w-auto" type="submit">
              保存
            </Button>
          </div>
        </form>
      </Panel>
      <Panel title="設定済み予算">
        {budgets.data?.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {budgets.data.map((item) => (
              <div key={item.id} className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">
                  {item.periodKey}・{item.budgetType === 'yearly' ? '年間' : '月間'}
                </p>
                <p className="mt-2 text-xl font-semibold">{formatYen(item.amountYen)}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>予算が設定されていません。</EmptyState>
        )}
      </Panel>
    </div>
  );
}

export function SimulationsPage() {
  const client = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const scenarios = useQuery({
    queryKey: ['simulations'],
    queryFn: () => apiRequest<SimulationScenario[]>('/api/simulations'),
  });
  const detail = useQuery({
    queryKey: ['simulation', selected],
    queryFn: () => apiRequest<SimulationScenario>(`/api/simulations/${selected}`),
    enabled: selected != null,
  });
  const result = useQuery({
    queryKey: ['simulation-result', selected],
    queryFn: () => apiRequest<SimulationResult>(`/api/simulations/${selected}/result`),
    enabled: selected != null,
  });
  const create = useMutation({
    mutationFn: (body: unknown) => postJson<SimulationScenario>('/api/simulations', body),
    onSuccess: (data) => {
      setSelected(data.id);
      void client.invalidateQueries({ queryKey: ['simulations'] });
    },
  });
  const addItem = useMutation({
    mutationFn: (body: unknown) => postJson(`/api/simulations/${selected}/items`, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['simulation', selected] });
      void client.invalidateQueries({ queryKey: ['simulation-result', selected] });
    },
  });
  function scenarioSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    create.mutate({
      name: f.get('name'),
      description: f.get('description') || null,
      startMonth: f.get('startMonth'),
      assumedPeriodMonths: Number(f.get('assumedPeriodMonths')),
    });
  }
  function itemSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    addItem.mutate({
      horseId: null,
      title: f.get('title'),
      shares: Number(f.get('shares')),
      initialAmountYen: Number(f.get('initialAmountYen')),
      monthlyAmountYen: Number(f.get('monthlyAmountYen')),
      annualAmountYen: Number(f.get('annualAmountYen')),
      note: null,
    });
  }
  return (
    <div className="grid gap-6">
      <PageHeader
        title="出資シミュレーション"
        description="候補を追加した場合の資金負担を仮想計算します。実際の予定や収支は作成しません。"
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
        <div className="grid content-start gap-4">
          <Panel title="シナリオを作成">
            <form className="grid gap-3" onSubmit={scenarioSubmit}>
              <Input name="name" placeholder="例：2027年募集検討" required />
              <Input name="startMonth" type="month" defaultValue={currentMonth()} required />
              <Input name="assumedPeriodMonths" type="number" min="1" max="120" defaultValue="12" />
              <Textarea name="description" placeholder="メモ" />
              <Button type="submit">作成</Button>
            </form>
          </Panel>
          <Panel title="シナリオ一覧">
            <div className="grid gap-2">
              {scenarios.data?.map((item) => (
                <Button
                  key={item.id}
                  variant={selected === item.id ? 'secondary' : 'ghost'}
                  className="justify-start"
                  onClick={() => setSelected(item.id)}
                >
                  {item.name}
                </Button>
              ))}
            </div>
          </Panel>
        </div>
        {!selected ? (
          <EmptyState>左でシナリオを作成または選択してください。</EmptyState>
        ) : (
          <div className="grid gap-4">
            {result.data ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <MetricCard label="想定期間の総額" value={result.data.periodTotalYen} />
                <MetricCard label="最初の12か月" value={result.data.firstYearTotalYen} />
                <MetricCard
                  label="追加後の予算残額"
                  value={result.data.remainingBudgetYen}
                  tone={result.data.isOverBudget ? 'warning' : 'default'}
                />
              </div>
            ) : null}
            <Panel title="候補を追加">
              <form
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6"
                onSubmit={itemSubmit}
              >
                <Input name="title" placeholder="候補名" required />
                <Input name="shares" type="number" min="1" defaultValue="1" aria-label="口数" />
                <Input name="initialAmountYen" type="number" min="0" placeholder="初回額" />
                <Input name="monthlyAmountYen" type="number" min="0" placeholder="月額" />
                <Input name="annualAmountYen" type="number" min="0" placeholder="年額" />
                <Button type="submit">追加</Button>
              </form>
            </Panel>
            <Panel title={detail.data?.name ?? '内訳'}>
              {detail.data?.items?.length ? (
                <div className="grid gap-2">
                  {detail.data.items.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-1 gap-2 rounded border p-3 text-sm sm:grid-cols-2 xl:grid-cols-4"
                    >
                      <strong>{item.title}</strong>
                      <span>初回 {formatYen(item.initialAmountYen)}</span>
                      <span>毎月 {formatYen(item.monthlyAmountYen)}</span>
                      <span>毎年 {formatYen(item.annualAmountYen)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState>候補を追加すると負担額を計算します。</EmptyState>
              )}
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
