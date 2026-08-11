import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatYen } from '@horse-asset-manager/shared';
import { ArrowRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { Field, Input, Select, Textarea } from '@/components/form';
import { MetricCard, PageHeader, Panel, StatusBadge } from '@/components/page';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  apiList,
  apiRequest,
  currentDate,
  currentMonth,
  deleteJson,
  patchJson,
  postJson,
} from '@/lib/api';
import type { Cashflow, Category, Club, Horse, RecoverySummary, Settlement } from '@/types';

const statusLabels: Record<Horse['status'], string> = {
  considering: '検討中',
  applied: '申込済み',
  invested: '出資確定',
  active: '運用中',
  retired: '引退',
  settling: '精算中',
  settled: '精算完了',
  rejected: '落選',
  skipped: '見送り',
};
const formatRate = (value: number | null | undefined) =>
  value == null ? '未算出' : `${value.toFixed(1)}%`;

function yenPreview(value: string): string {
  if (value === '') return '入力額：未入力';
  const amountYen = Number(value);
  return Number.isSafeInteger(amountYen) && amountYen >= 0
    ? `入力額：${formatYen(amountYen)}`
    : '0以上の円単位整数を入力してください。';
}

function HorseDeleteDialog({
  horse,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: {
  horse: Horse | null;
  pending: boolean;
  error: unknown;
  onOpenChange: (open: boolean) => void;
  onConfirm: (confirmationName: string) => void;
}) {
  if (!horse) return null;
  return (
    <OpenHorseDeleteDialog
      key={horse.id}
      horse={horse}
      pending={pending}
      error={error}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />
  );
}

function OpenHorseDeleteDialog({
  horse,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: {
  horse: Horse;
  pending: boolean;
  error: unknown;
  onOpenChange: (open: boolean) => void;
  onConfirm: (confirmationName: string) => void;
}) {
  const [confirmationName, setConfirmationName] = useState('');
  const matches = confirmationName === horse.name;
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>「{horse.name}」を削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            この操作は取り消せません。馬本体だけでなく、出資情報、確定収支、予定、照合、
            精算記録も完全に削除され、回収率・予算・分析・CSVから除外されます。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field label={`確認のため「${horse.name}」と入力してください`}>
          <Input
            autoComplete="off"
            value={confirmationName}
            onChange={(event) => setConfirmationName(event.target.value)}
            disabled={pending}
          />
        </Field>
        {error ? <ErrorState error={error} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button type="button" variant="outline" disabled={pending}>
              キャンセル
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              type="button"
              disabled={pending || !matches}
              className="bg-red-700 text-white hover:bg-red-800"
              onClick={(event) => {
                event.preventDefault();
                onConfirm(confirmationName);
              }}
            >
              <Trash2 />
              {pending ? '削除中…' : '完全に削除'}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function HorseNameEditDialog({
  horse,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: {
  horse: Horse | null;
  pending: boolean;
  error: unknown;
  onOpenChange: (open: boolean) => void;
  onConfirm: (value: { name: string; nameKana: string | null }) => void;
}) {
  if (!horse) return null;
  return (
    <OpenHorseNameEditDialog
      key={`${horse.id}:${horse.name}`}
      horse={horse}
      pending={pending}
      error={error}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />
  );
}

function OpenHorseNameEditDialog({
  horse,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: {
  horse: Horse;
  pending: boolean;
  error: unknown;
  onOpenChange: (open: boolean) => void;
  onConfirm: (value: { name: string; nameKana: string | null }) => void;
}) {
  const [name, setName] = useState(horse.name);
  const [nameKana, setNameKana] = useState(horse.nameKana ?? '');
  const valid =
    name.trim().length > 0 && name.trim().length <= 100 && nameKana.trim().length <= 100;
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>馬名を編集</AlertDialogTitle>
          <AlertDialogDescription>
            募集時の名前から正式な馬名へ変更できます。変更前の名前は以前の名前として残り、PDF取込時の照合にも使用します。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-4">
          <Field label="馬名">
            <Input
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
            />
          </Field>
          <Field label="馬名カナ（任意）">
            <Input
              value={nameKana}
              maxLength={100}
              onChange={(event) => setNameKana(event.target.value)}
              disabled={pending}
            />
          </Field>
          {error ? <ErrorState error={error} /> : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button type="button" variant="outline" disabled={pending}>
              キャンセル
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              type="button"
              disabled={pending || !valid}
              onClick={(event) => {
                event.preventDefault();
                onConfirm({ name: name.trim(), nameKana: nameKana.trim() || null });
              }}
            >
              <Pencil />
              {pending ? '保存中…' : '名前を保存'}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function HorsesPage({ prospects = false }: { prospects?: boolean }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [unitPriceInput, setUnitPriceInput] = useState('');
  const [horseToDelete, setHorseToDelete] = useState<Horse | null>(null);
  const suffix = prospects ? '&status=considering' : '';
  const horses = useQuery({
    queryKey: ['horses', prospects],
    queryFn: () => apiList<Horse>(`/api/horses?pageSize=100${suffix}`),
  });
  const clubs = useQuery({
    queryKey: ['clubs'],
    queryFn: () => apiList<Club>('/api/clubs?pageSize=100'),
  });
  const create = useMutation({
    mutationFn: (body: unknown) => postJson<Horse>('/api/horses', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['horses'] });
      setOpen(false);
      setUnitPriceInput('');
    },
  });
  const remove = useMutation({
    mutationFn: ({ horseId, confirmationName }: { horseId: number; confirmationName: string }) =>
      deleteJson<{ deleted: boolean }>(`/api/horses/${horseId}`, { confirmationName }),
    onSuccess: () => {
      void client.invalidateQueries();
      setHorseToDelete(null);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const number = (key: string) => (form.get(key) ? Number(form.get(key)) : null);
    create.mutate({
      name: form.get('name'),
      clubId: number('clubId'),
      recruitmentYear: number('recruitmentYear'),
      unitPriceYen: number('unitPriceYen'),
      plannedShares: number('plannedShares'),
      expectedMonthlyCostYen: number('expectedMonthlyCostYen'),
      applicationDeadline: form.get('applicationDeadline') || null,
      status: 'considering',
      note: form.get('note') || null,
    });
  }
  return (
    <div className="grid gap-6">
      <PageHeader
        title={prospects ? '出資検討' : '出資馬管理'}
        description={
          prospects
            ? '候補馬の募集条件と期限、必要額を整理します。予想や推奨判定は行いません。'
            : '出資後のお金の流れと現在の状態を馬ごとに管理します。'
        }
        actions={
          <Button onClick={() => setOpen((value) => !value)}>
            <Plus />
            候補馬を登録
          </Button>
        }
      />
      {open ? (
        <Panel title="候補馬の登録">
          <form className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" onSubmit={submit}>
            <Field label="馬名">
              <Input name="name" required />
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
            <Field label="募集年">
              <Input name="recruitmentYear" type="number" min="1990" max="2200" />
            </Field>
            <Field label="一口価格（円）">
              <Input
                aria-describedby="candidate-unit-price-help candidate-unit-price-preview"
                name="unitPriceYen"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="160000"
                value={unitPriceInput}
                onChange={(event) => setUnitPriceInput(event.target.value)}
              />
              <span id="candidate-unit-price-help" className="text-xs text-muted-foreground">
                例：16万円の場合は160000と入力します。
              </span>
              <span
                id="candidate-unit-price-preview"
                aria-live="polite"
                className="text-xs font-normal text-primary"
              >
                {yenPreview(unitPriceInput)}
              </span>
            </Field>
            <Field label="検討口数">
              <Input name="plannedShares" type="number" min="1" />
            </Field>
            <Field label="月額見込み（円）">
              <Input name="expectedMonthlyCostYen" type="number" min="0" />
            </Field>
            <Field label="募集締切">
              <Input name="applicationDeadline" type="date" />
            </Field>
            <Field label="メモ">
              <Textarea name="note" />
            </Field>
            <div className="flex items-end sm:col-span-2 xl:col-span-1">
              <Button className="w-full xl:w-auto" disabled={create.isPending} type="submit">
                保存
              </Button>
            </div>
          </form>
          {create.error ? <ErrorState error={create.error} /> : null}
        </Panel>
      ) : null}
      {horses.isLoading ? (
        <LoadingState />
      ) : horses.error ? (
        <ErrorState error={horses.error} />
      ) : horses.data?.data.length === 0 ? (
        <EmptyState>まだ登録がありません。「候補馬を登録」から始めましょう。</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {horses.data?.data.map((horse) => {
            const displayedUnitPriceYen = prospects
              ? horse.unitPriceYen
              : (horse.investment?.unitPriceYen ?? horse.unitPriceYen);
            return (
              <article key={horse.id} className="rounded-xl border bg-card p-5 shadow-sm">
                <Link to={`/horses/${horse.id}`} className="group block hover:text-primary">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">{horse.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {horse.recruitmentYear ? `${horse.recruitmentYear}年募集` : '募集年未設定'}
                      </p>
                    </div>
                    <StatusBadge tone={horse.status === 'active' ? 'success' : 'neutral'}>
                      {statusLabels[horse.status] ?? horse.status}
                    </StatusBadge>
                  </div>
                  <dl className="mt-5 grid gap-2 text-sm text-foreground">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">一口価格</dt>
                      <dd>
                        {displayedUnitPriceYen == null
                          ? '未設定'
                          : formatYen(displayedUnitPriceYen)}
                      </dd>
                    </div>
                    {!prospects && horse.investment ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">出資金合計</dt>
                        <dd>{formatYen(horse.investment.committedAmountYen)}</dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">月額見込み</dt>
                      <dd>
                        {horse.expectedMonthlyCostYen == null
                          ? '未設定'
                          : formatYen(horse.expectedMonthlyCostYen)}
                      </dd>
                    </div>
                  </dl>
                  <span className="mt-5 flex items-center justify-end gap-1 text-sm text-primary">
                    詳細を見る
                    <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                  </span>
                </Link>
                <div className="mt-3 flex justify-end border-t pt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-red-700 hover:bg-red-50 hover:text-red-800"
                    aria-label={`${horse.name}を削除`}
                    onClick={() => {
                      remove.reset();
                      setHorseToDelete(horse);
                    }}
                  >
                    <Trash2 />
                    削除
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <HorseDeleteDialog
        horse={horseToDelete}
        pending={remove.isPending}
        error={remove.error}
        onOpenChange={(dialogOpen) => {
          if (!dialogOpen && !remove.isPending) setHorseToDelete(null);
        }}
        onConfirm={(confirmationName) => {
          if (horseToDelete) remove.mutate({ horseId: horseToDelete.id, confirmationName });
        }}
      />
    </div>
  );
}

export function ProspectsPage() {
  return <HorsesPage prospects />;
}

interface Ledger {
  summary: RecoverySummary;
  cashflows: Cashflow[];
}

function InvestmentConfirmationForm({
  horse,
  pending,
  error,
  onSubmit,
}: {
  horse: Horse;
  pending: boolean;
  error: unknown;
  onSubmit: (value: { shares: number; unitPriceYen: number; committedAmountYen: number }) => void;
}) {
  const [sharesInput, setSharesInput] = useState(String(horse.plannedShares ?? 1));
  const [unitPriceInput, setUnitPriceInput] = useState(String(horse.unitPriceYen ?? ''));
  const shares = Number(sharesInput);
  const unitPriceYen = Number(unitPriceInput);
  const committedAmountYen = shares * unitPriceYen;
  const isValid =
    Number.isSafeInteger(shares) &&
    shares > 0 &&
    Number.isSafeInteger(unitPriceYen) &&
    unitPriceYen >= 0 &&
    Number.isSafeInteger(committedAmountYen);

  return (
    <>
      <form
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (isValid) onSubmit({ shares, unitPriceYen, committedAmountYen });
        }}
      >
        <Field label="口数">
          <Input
            name="shares"
            type="number"
            min="1"
            step="1"
            required
            value={sharesInput}
            onChange={(event) => setSharesInput(event.target.value)}
          />
        </Field>
        <Field label="一口価格（円）">
          <Input
            aria-describedby="investment-unit-price-help investment-unit-price-preview"
            name="unitPriceYen"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            placeholder="160000"
            required
            value={unitPriceInput}
            onChange={(event) => setUnitPriceInput(event.target.value)}
          />
          <span id="investment-unit-price-help" className="text-xs text-muted-foreground">
            例：16万円の場合は160000と入力します。
          </span>
          <span
            id="investment-unit-price-preview"
            aria-live="polite"
            className="text-xs font-normal text-primary"
          >
            {yenPreview(unitPriceInput)}
          </span>
        </Field>
        <Field label="契約総額・初回支出（自動計算）">
          <Input name="committedAmountYen" readOnly value={isValid ? committedAmountYen : ''} />
          <span aria-live="polite" className="text-xs font-normal text-primary">
            {isValid
              ? `計算結果：${formatYen(committedAmountYen)}`
              : '口数と一口価格を入力してください。'}
          </span>
        </Field>
        <div className="flex items-end">
          <Button className="w-full xl:w-auto" type="submit" disabled={!isValid || pending}>
            {pending ? '登録中…' : '出資と支出を登録'}
          </Button>
        </div>
      </form>
      {error ? (
        <div className="mt-4">
          <ErrorState error={error} />
        </div>
      ) : null}
    </>
  );
}

export function HorseDetailPage() {
  const id = Number(useParams().id);
  const client = useQueryClient();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [nameEditOpen, setNameEditOpen] = useState(false);
  const horse = useQuery({
    queryKey: ['horse', id],
    queryFn: () => apiRequest<Horse>(`/api/horses/${id}`),
    enabled: Number.isInteger(id),
  });
  const ledger = useQuery({
    queryKey: ['ledger', id],
    queryFn: () => apiRequest<Ledger>(`/api/horses/${id}/ledger`),
  });
  const settlements = useQuery({
    queryKey: ['settlements', id],
    queryFn: () => apiRequest<Settlement[]>(`/api/horses/${id}/settlements`),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiRequest<Category[]>('/api/categories'),
  });
  const invest = useMutation({
    mutationFn: (body: unknown) => postJson(`/api/investments`, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['horse', id] });
      void client.invalidateQueries({ queryKey: ['ledger', id] });
    },
  });
  const addSettlement = useMutation({
    mutationFn: (body: unknown) => postJson(`/api/horses/${id}/settlements`, body),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['settlements', id] }),
  });
  const transition = useMutation({
    mutationFn: (status: Horse['status']) => patchJson(`/api/horses/${id}`, { status }),
    onMutate: async (status) => {
      await client.cancelQueries({ queryKey: ['horse', id] });
      const previous = client.getQueryData<Horse>(['horse', id]);
      client.setQueryData<Horse>(['horse', id], (current) =>
        current ? { ...current, status } : current,
      );
      return { previous };
    },
    onError: (_error, _status, context) => {
      if (context?.previous) client.setQueryData(['horse', id], context.previous);
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['horse', id] });
      void client.invalidateQueries({ queryKey: ['horses'] });
      void client.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const updateName = useMutation({
    mutationFn: (body: { name: string; nameKana: string | null }) =>
      patchJson<Horse>(`/api/horses/${id}`, body),
    onSuccess: () => {
      setNameEditOpen(false);
      void client.invalidateQueries({ queryKey: ['horse', id] });
      void client.invalidateQueries({ queryKey: ['horses'] });
      void client.invalidateQueries({ queryKey: ['cashflows'] });
      void client.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
  const remove = useMutation({
    mutationFn: (confirmationName: string) =>
      deleteJson<{ deleted: boolean }>(`/api/horses/${id}`, { confirmationName }),
    onSuccess: () => {
      const destination = horse.data?.investment ? '/horses' : '/prospects';
      void client.invalidateQueries();
      client.removeQueries({ queryKey: ['horse', id] });
      navigate(destination, { replace: true });
    },
  });
  const completeSettlement = useMutation({
    mutationFn: ({ settlementId, categoryId }: { settlementId: number; categoryId: number }) =>
      postJson(`/api/settlements/${settlementId}/complete`, {
        settledOn: currentDate(),
        categoryId,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['settlements', id] });
      void client.invalidateQueries({ queryKey: ['ledger', id] });
    },
  });
  const markSettled = useMutation({
    mutationFn: () => postJson(`/api/horses/${id}/mark-settled`, {}),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['horse', id] }),
  });
  if (horse.isLoading || ledger.isLoading) return <LoadingState />;
  if (horse.error || !horse.data) return <ErrorState error={horse.error} />;
  const value = horse.data;
  function settlementSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    addSettlement.mutate({
      settlementType: f.get('settlementType'),
      direction: f.get('direction'),
      amountYen: Number(f.get('amountYen')),
      plannedOn: f.get('plannedOn') || null,
      note: null,
    });
  }
  return (
    <div className="grid gap-6">
      <PageHeader
        title={value.name}
        description="契約条件、確定収支、回収率、引退精算を一か所で確認します。"
        actions={
          <div className="grid gap-2 sm:justify-items-end">
            <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  updateName.reset();
                  setNameEditOpen(true);
                }}
              >
                <Pencil />
                馬名を編集
              </Button>
              <Select
                aria-label="馬のステータス"
                value={value.status}
                disabled={transition.isPending}
                onChange={(event) => transition.mutate(event.target.value as Horse['status'])}
              >
                {Object.entries(statusLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                onClick={() => {
                  remove.reset();
                  setDeleteOpen(true);
                }}
              >
                <Trash2 />
                削除
              </Button>
            </div>
            <p className="max-w-md text-xs leading-5 text-muted-foreground sm:text-right">
              ステータスだけを変更します。出資・収支・精算データは自動登録されません。
            </p>
          </div>
        }
      />
      {transition.error ? <ErrorState error={transition.error} /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="確定支出" value={ledger.data?.summary.expenseYen ?? 0} />
        <MetricCard label="確定入金" value={ledger.data?.summary.incomeYen ?? 0} tone="positive" />
        <MetricCard
          label={`総合回収率 ${formatRate(ledger.data?.summary.totalRecoveryRate)}`}
          value={ledger.data?.summary.profitLossYen ?? 0}
        />
        <MetricCard
          label={`馬代回収率 ${formatRate(ledger.data?.summary.principalRecoveryRate)}`}
          value={ledger.data?.summary.investmentPrincipalYen ?? 0}
        />
      </div>
      <Panel title="基本情報">
        <dl className="grid max-w-3xl grid-cols-1 gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">現在の馬名</dt>
            <dd className="mt-1 font-medium">{value.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">馬名カナ</dt>
            <dd className="mt-1 font-medium">{value.nameKana || '未設定'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">以前の名前</dt>
            <dd className="mt-1 font-medium">
              {value.aliases?.length ? value.aliases.join('、') : 'なし'}
            </dd>
          </div>
        </dl>
      </Panel>
      {!value.investment ? (
        <Panel title="出資を確定する">
          <InvestmentConfirmationForm
            horse={value}
            pending={invest.isPending}
            error={invest.error}
            onSubmit={({ shares, unitPriceYen, committedAmountYen }) =>
              invest.mutate({
                horseId: id,
                shares,
                unitPriceYen,
                committedAmountYen,
                joinedOn: currentDate(),
                note: null,
                initialCashflow: {
                  amountYen: committedAmountYen,
                  occurredOn: currentDate(),
                  targetMonth: currentMonth(),
                },
              })
            }
          />
        </Panel>
      ) : (
        <Panel title="出資条件">
          <dl className="grid max-w-xl grid-cols-1 gap-5 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">出資口数</dt>
              <dd className="mt-1 font-medium">{value.investment.shares}口</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">一口価格</dt>
              <dd className="mt-1 font-medium">{formatYen(value.investment.unitPriceYen)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">出資金合計</dt>
              <dd className="mt-1 font-medium">{formatYen(value.investment.committedAmountYen)}</dd>
            </div>
          </dl>
        </Panel>
      )}
      <Panel title="最近の確定収支">
        {ledger.data?.cashflows.length ? (
          <>
            <div className="grid gap-3 md:hidden">
              {ledger.data.cashflows.map((row) => (
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
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">金額</span>
                    <strong className="tabular-nums">{formatYen(row.amountYen)}</strong>
                  </div>
                </article>
              ))}
            </div>
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2">日付</th>
                    <th>内容</th>
                    <th>区分</th>
                    <th className="text-right">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.data.cashflows.map((row) => (
                    <tr key={row.id} className="border-b">
                      <td className="py-3">{row.occurredOn}</td>
                      <td>{row.title}</td>
                      <td>{row.direction === 'expense' ? '支出' : '入金'}</td>
                      <td className="text-right tabular-nums">{formatYen(row.amountYen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState>この馬の確定収支はまだありません。</EmptyState>
        )}
      </Panel>
      {value.status === 'retired' || value.status === 'settling' || value.status === 'settled' ? (
        <Panel title="引退・精算">
          <form
            className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"
            onSubmit={settlementSubmit}
          >
            <Select name="settlementType">
              <option value="sale_proceeds">売却代金</option>
              <option value="insurance">保険金</option>
              <option value="final_cost">最終維持費</option>
              <option value="retirement_settlement">引退精算金</option>
            </Select>
            <Select name="direction">
              <option value="income">入金</option>
              <option value="expense">支出</option>
            </Select>
            <Input name="amountYen" type="number" min="0" placeholder="金額" required />
            <Input name="plannedOn" type="date" />
            <Button type="submit">予定を追加</Button>
          </form>
          <div className="grid gap-2">
            {settlements.data?.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 rounded border p-3 text-sm sm:flex sm:items-center sm:justify-between"
              >
                <span>
                  {item.settlementType}（{item.status}）
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <strong>{formatYen(item.amountYen)}</strong>
                  {item.status === 'planned' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        !categories.data?.some(
                          (category) => category.categoryType === item.direction,
                        ) || completeSettlement.isPending
                      }
                      onClick={() => {
                        const categoryId = categories.data?.find(
                          (category) => category.categoryType === item.direction,
                        )?.id;
                        if (categoryId)
                          completeSettlement.mutate({ settlementId: item.id, categoryId });
                      }}
                    >
                      {item.direction === 'income' ? '受領済みにする' : '支払済みにする'}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {value.status === 'settling' ? (
            <div className="mt-5 flex justify-end">
              <Button
                variant="outline"
                disabled={settlements.data?.some((item) => item.status === 'planned')}
                onClick={() => markSettled.mutate()}
              >
                すべての精算を完了する
              </Button>
            </div>
          ) : null}
        </Panel>
      ) : null}
      <HorseDeleteDialog
        horse={deleteOpen ? value : null}
        pending={remove.isPending}
        error={remove.error}
        onOpenChange={(dialogOpen) => {
          if (!dialogOpen && !remove.isPending) setDeleteOpen(false);
        }}
        onConfirm={(confirmationName) => remove.mutate(confirmationName)}
      />
      <HorseNameEditDialog
        horse={nameEditOpen ? value : null}
        pending={updateName.isPending}
        error={updateName.error}
        onOpenChange={(dialogOpen) => {
          if (!dialogOpen && !updateName.isPending) setNameEditOpen(false);
        }}
        onConfirm={(body) => updateName.mutate(body)}
      />
    </div>
  );
}
