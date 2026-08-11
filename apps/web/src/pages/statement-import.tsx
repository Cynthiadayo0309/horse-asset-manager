import { formatYen } from '@horse-asset-manager/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileText, Upload } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';

import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { Field, Input, Select } from '@/components/form';
import { PageHeader, Panel, StatusBadge } from '@/components/page';
import { Button } from '@/components/ui/button';
import {
  findMatchingHorseIds,
  type ParsedStatement,
} from '@/features/statement-import/statement-parser';
import { readStatementPdf } from '@/features/statement-import/pdf-reader';
import { apiList, apiRequest, postJson } from '@/lib/api';
import type { Category, Club, Horse } from '@/types';

interface EditableItem {
  sourceLineKey: string;
  direction: 'expense' | 'income';
  title: string;
  amountYen: number;
  horseLabel: string | null;
  categorySystemCode: string;
  enabled: boolean;
  horseId: number | null;
  clubId: number | null;
  categoryId: number | null;
  effectiveOn: string;
  targetMonth: string;
}

interface ImportDraft {
  documentHash: string;
  fileName: string;
  statement: ParsedStatement;
  items: EditableItem[];
}

interface ImportResult {
  importId: number;
  destination: 'scheduled' | 'confirmed';
  createdCount: number;
}

export function StatementImportPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [destination, setDestination] = useState<'scheduled' | 'confirmed'>('scheduled');
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<unknown>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const horses = useQuery({
    queryKey: ['horses', 'statement-import'],
    queryFn: () => apiList<Horse>('/api/horses?pageSize=100'),
  });
  const clubs = useQuery({
    queryKey: ['clubs'],
    queryFn: () => apiList<Club>('/api/clubs?pageSize=100'),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiRequest<Category[]>('/api/categories'),
  });

  const save = useMutation({
    mutationFn: (body: unknown) => postJson<ImportResult>('/api/statement-imports', body),
    onSuccess: (data) => {
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: ['cashflows'] });
      void queryClient.invalidateQueries({ queryKey: ['scheduled'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['budgets'] });
      void queryClient.invalidateQueries({ queryKey: ['available-budget'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const selectedItems = draft?.items.filter((item) => item.enabled) ?? [];
  const expenseYen = selectedItems
    .filter((item) => item.direction === 'expense')
    .reduce((sum, item) => sum + item.amountYen, 0);
  const incomeYen = selectedItems
    .filter((item) => item.direction === 'income')
    .reduce((sum, item) => sum + item.amountYen, 0);
  const referencesValid = selectedItems.every(
    (item) =>
      item.clubId != null &&
      item.categoryId != null &&
      (!item.horseLabel || item.horseId != null) &&
      categories.data?.find((category) => category.id === item.categoryId)?.categoryType ===
        item.direction,
  );
  const totalsMatch =
    draft != null &&
    expenseYen === draft.statement.expectedExpenseYen &&
    incomeYen === draft.statement.expectedIncomeYen;
  const canSave = selectedItems.length > 0 && referencesValid && totalsMatch && !save.isPending;

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setReading(true);
    setReadError(null);
    setDraft(null);
    setResult(null);
    save.reset();
    try {
      const parsed = await readStatementPdf(file);
      const check = await apiRequest<{ imported: boolean }>(
        `/api/statement-imports/check?documentHash=${encodeURIComponent(parsed.documentHash)}`,
      );
      if (check.imported) {
        throw new Error(
          'このPDFはすでに取り込まれています。予定として登録した場合は、予定・実績照合をご利用ください。',
        );
      }
      const clubId = findClubId(parsed.statement.sourceType, clubs.data?.data ?? []);
      const editableItems = parsed.statement.items.map<EditableItem>((item) => {
        const horseMatches = item.horseLabel
          ? findMatchingHorseIds(item.horseLabel, horses.data?.data ?? [])
          : [];
        const category = categories.data?.find(
          (candidate) =>
            candidate.systemCode === item.categorySystemCode &&
            candidate.categoryType === item.direction,
        );
        return {
          ...item,
          enabled: true,
          horseId: horseMatches.length === 1 ? (horseMatches[0] ?? null) : null,
          clubId,
          categoryId: category?.id ?? null,
          effectiveOn: parsed.statement.effectiveOn,
          targetMonth: parsed.statement.targetMonth,
        };
      });
      setDraft({
        documentHash: parsed.documentHash,
        fileName: file.name,
        statement: parsed.statement,
        items: editableItems,
      });
    } catch (error) {
      setReadError(error);
    } finally {
      setReading(false);
    }
  }

  function updateItem(index: number, updates: Partial<EditableItem>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item, itemIndex) =>
              itemIndex === index ? { ...item, ...updates } : item,
            ),
          }
        : current,
    );
  }

  function submit() {
    if (!draft || !canSave) return;
    save.mutate({
      sourceType: draft.statement.sourceType,
      destination,
      documentHash: draft.documentHash,
      targetMonth: draft.statement.targetMonth,
      expectedExpenseYen: draft.statement.expectedExpenseYen,
      expectedIncomeYen: draft.statement.expectedIncomeYen,
      items: selectedItems.map((item) => ({
        sourceLineKey: item.sourceLineKey,
        horseId: item.horseId,
        clubId: item.clubId,
        categoryId: item.categoryId,
        direction: item.direction,
        title: item.title,
        amountYen: item.amountYen,
        effectiveOn: item.effectiveOn,
        targetMonth: item.targetMonth,
      })),
    });
  }

  if (horses.isLoading || clubs.isLoading || categories.isLoading) return <LoadingState />;
  if (horses.error || clubs.error || categories.error) {
    return <ErrorState error={horses.error ?? clubs.error ?? categories.error} />;
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="PDF請求書の取り込み"
        description="シルクとロードの文字を選択できるPDFを、端末内で読み取って登録します。PDF本体は送信・保存されません。"
        actions={
          <Button asChild variant="outline">
            <Link to="/cashflows">収支管理へ戻る</Link>
          </Button>
        }
      />

      {result ? (
        <Panel>
          <div className="grid justify-items-center gap-4 py-6 text-center">
            <img className="h-32 w-32 object-contain" src="/brand/ham-mascot.png" alt="" />
            <CheckCircle2 className="size-10 text-emerald-700" />
            <div>
              <h2 className="text-xl font-bold">取り込みが完了しました</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {result.createdCount}件を
                {result.destination === 'scheduled' ? '支払い予定' : '確定収支'}へ登録しました。
              </p>
            </div>
            <div className="grid w-full gap-3 sm:flex sm:w-auto">
              <Button
                variant="outline"
                onClick={() => {
                  setDraft(null);
                  setResult(null);
                }}
              >
                続けて取り込む
              </Button>
              <Button asChild>
                <Link to={result.destination === 'scheduled' ? '/scheduled' : '/cashflows'}>
                  登録内容を見る
                </Link>
              </Button>
            </div>
          </div>
        </Panel>
      ) : (
        <>
          <Panel title="1. PDFを選択">
            <div className="grid justify-items-center gap-4 rounded-xl border border-dashed bg-muted/30 px-8 py-10 text-center">
              <img className="h-28 w-28 object-contain" src="/brand/ham-mascot.png" alt="" />
              <FileText className="size-9 text-primary" />
              <div>
                <p className="font-medium">シルクまたはロードの請求PDF</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  文字選択できるPDF、20MB以下・10ページ以下に対応します。
                </p>
              </div>
              <Button asChild disabled={reading}>
                <label className="cursor-pointer">
                  <Upload />
                  {reading ? '読み取り中…' : 'PDFを選択'}
                  <input
                    className="sr-only"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(event) => void selectFile(event)}
                    disabled={reading}
                  />
                </label>
              </Button>
            </div>
            {readError ? (
              <div className="mt-4">
                <ErrorState error={readError} />
              </div>
            ) : null}
          </Panel>

          {draft ? (
            <>
              <Panel title="2. 読み取り結果">
                <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 xl:grid-cols-5">
                  <Summary label="ファイル" value={draft.fileName} />
                  <Summary label="発行元" value={draft.statement.issuer} />
                  <Summary label="対象年月" value={draft.statement.targetMonth} />
                  <Summary label="支出合計" value={formatYen(draft.statement.expectedExpenseYen)} />
                  <Summary label="入金合計" value={formatYen(draft.statement.expectedIncomeYen)} />
                </div>
              </Panel>

              <Panel title="3. 登録先と明細を確認">
                <div className="mb-5 max-w-sm">
                  <Field label="登録先">
                    <Select
                      value={destination}
                      onChange={(event) =>
                        setDestination(event.target.value as 'scheduled' | 'confirmed')
                      }
                    >
                      <option value="scheduled">支払い予定</option>
                      <option value="confirmed">支払済み（確定収支）</option>
                    </Select>
                  </Field>
                </div>
                <div className="grid gap-4 xl:hidden">
                  {draft.items.map((item, index) => (
                    <ImportItemCard
                      key={item.sourceLineKey}
                      item={item}
                      index={index}
                      horses={horses.data?.data ?? []}
                      clubs={clubs.data?.data ?? []}
                      categories={categories.data ?? []}
                      onUpdate={updateItem}
                    />
                  ))}
                </div>
                <div className="hidden overflow-x-auto xl:block">
                  <table className="min-w-[1180px] w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2">登録</th>
                        <th>区分</th>
                        <th>内容</th>
                        <th>金額</th>
                        <th>馬</th>
                        <th>クラブ</th>
                        <th>カテゴリー</th>
                        <th>日付</th>
                        <th>対象年月</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.items.map((item, index) => (
                        <tr key={item.sourceLineKey} className="border-b align-top">
                          <td className="py-3 pr-2">
                            <input
                              aria-label={`${item.title}を登録する`}
                              type="checkbox"
                              checked={item.enabled}
                              onChange={(event) =>
                                updateItem(index, { enabled: event.target.checked })
                              }
                            />
                          </td>
                          <td className="py-3 pr-2">
                            {item.direction === 'expense' ? '支出' : '入金'}
                          </td>
                          <td className="py-2 pr-2">
                            <Input
                              className="w-56"
                              value={item.title}
                              maxLength={200}
                              disabled={!item.enabled}
                              onChange={(event) => updateItem(index, { title: event.target.value })}
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <Input
                              className="w-28"
                              type="number"
                              min="1"
                              value={item.amountYen}
                              disabled={!item.enabled}
                              onChange={(event) =>
                                updateItem(index, { amountYen: Number(event.target.value) })
                              }
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <Select
                              className="w-44"
                              value={item.horseId ?? ''}
                              disabled={!item.enabled}
                              onChange={(event) =>
                                updateItem(index, {
                                  horseId: event.target.value ? Number(event.target.value) : null,
                                })
                              }
                            >
                              <option value="">
                                {item.horseLabel ? `選択：${item.horseLabel}` : '馬に紐づけない'}
                              </option>
                              {horses.data?.data.map((horse) => (
                                <option key={horse.id} value={horse.id}>
                                  {horse.name}
                                </option>
                              ))}
                            </Select>
                          </td>
                          <td className="py-2 pr-2">
                            <Select
                              className="w-44"
                              value={item.clubId ?? ''}
                              disabled={!item.enabled}
                              onChange={(event) =>
                                updateItem(index, {
                                  clubId: event.target.value ? Number(event.target.value) : null,
                                })
                              }
                            >
                              <option value="">クラブを選択</option>
                              {clubs.data?.data.map((club) => (
                                <option key={club.id} value={club.id}>
                                  {club.name}
                                </option>
                              ))}
                            </Select>
                          </td>
                          <td className="py-2 pr-2">
                            <Select
                              className="w-44"
                              value={item.categoryId ?? ''}
                              disabled={!item.enabled}
                              onChange={(event) =>
                                updateItem(index, {
                                  categoryId: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                })
                              }
                            >
                              <option value="">カテゴリーを選択</option>
                              {categories.data
                                ?.filter((category) => category.categoryType === item.direction)
                                .map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.name}
                                  </option>
                                ))}
                            </Select>
                          </td>
                          <td className="py-2 pr-2">
                            <Input
                              className="w-36"
                              type="date"
                              value={item.effectiveOn}
                              disabled={!item.enabled}
                              onChange={(event) =>
                                updateItem(index, { effectiveOn: event.target.value })
                              }
                            />
                          </td>
                          <td className="py-2">
                            <Input
                              className="w-32"
                              type="month"
                              value={item.targetMonth}
                              disabled={!item.enabled}
                              onChange={(event) =>
                                updateItem(index, { targetMonth: event.target.value })
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="4. 合計を確認して登録">
                <div className="grid gap-6 xl:flex xl:items-center xl:justify-between">
                  <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3 sm:gap-8">
                    <Summary label="選択した支出" value={formatYen(expenseYen)} />
                    <Summary label="選択した入金" value={formatYen(incomeYen)} />
                    <Summary
                      label="PDFとの差額"
                      value={formatYen(
                        expenseYen -
                          draft.statement.expectedExpenseYen -
                          (incomeYen - draft.statement.expectedIncomeYen),
                      )}
                    />
                  </div>
                  <Button className="w-full xl:w-auto" disabled={!canSave} onClick={submit}>
                    {save.isPending ? '登録中…' : `${selectedItems.length}件を一括登録`}
                  </Button>
                </div>
                {!totalsMatch ? (
                  <p className="mt-4 text-sm text-red-700">
                    PDFの合計と選択した明細の合計が一致していません。金額または登録対象を確認してください。
                  </p>
                ) : null}
                {!referencesValid ? (
                  <p className="mt-2 text-sm text-red-700">
                    馬、クラブ、カテゴリーが未選択の明細があります。
                  </p>
                ) : null}
                {save.error ? (
                  <div className="mt-4">
                    <ErrorState error={save.error} />
                  </div>
                ) : null}
              </Panel>
            </>
          ) : (
            <EmptyState>PDFを選択すると、読み取った明細をここで確認できます。</EmptyState>
          )}
        </>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function ImportItemCard({
  item,
  index,
  horses,
  clubs,
  categories,
  onUpdate,
}: {
  item: EditableItem;
  index: number;
  horses: Horse[];
  clubs: Club[];
  categories: Category[];
  onUpdate: (index: number, updates: Partial<EditableItem>) => void;
}) {
  return (
    <article className={`grid gap-4 rounded-xl border p-4 ${item.enabled ? '' : 'bg-muted/40'}`}>
      <div className="flex items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={item.enabled}
            onChange={(event) => onUpdate(index, { enabled: event.target.checked })}
          />
          この明細を登録する
        </label>
        <StatusBadge tone={item.direction === 'income' ? 'success' : 'neutral'}>
          {item.direction === 'expense' ? '支出' : '入金'}
        </StatusBadge>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="内容">
            <Input
              value={item.title}
              maxLength={200}
              disabled={!item.enabled}
              onChange={(event) => onUpdate(index, { title: event.target.value })}
            />
          </Field>
        </div>
        <Field label="金額（円）">
          <Input
            type="number"
            min="1"
            value={item.amountYen}
            disabled={!item.enabled}
            onChange={(event) => onUpdate(index, { amountYen: Number(event.target.value) })}
          />
        </Field>
        <Field label="馬">
          <Select
            value={item.horseId ?? ''}
            disabled={!item.enabled}
            onChange={(event) =>
              onUpdate(index, {
                horseId: event.target.value ? Number(event.target.value) : null,
              })
            }
          >
            <option value="">
              {item.horseLabel ? `選択：${item.horseLabel}` : '馬に紐づけない'}
            </option>
            {horses.map((horse) => (
              <option key={horse.id} value={horse.id}>
                {horse.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="クラブ">
          <Select
            value={item.clubId ?? ''}
            disabled={!item.enabled}
            onChange={(event) =>
              onUpdate(index, {
                clubId: event.target.value ? Number(event.target.value) : null,
              })
            }
          >
            <option value="">クラブを選択</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="カテゴリー">
          <Select
            value={item.categoryId ?? ''}
            disabled={!item.enabled}
            onChange={(event) =>
              onUpdate(index, {
                categoryId: event.target.value ? Number(event.target.value) : null,
              })
            }
          >
            <option value="">カテゴリーを選択</option>
            {categories
              .filter((category) => category.categoryType === item.direction)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="日付">
          <Input
            type="date"
            value={item.effectiveOn}
            disabled={!item.enabled}
            onChange={(event) => onUpdate(index, { effectiveOn: event.target.value })}
          />
        </Field>
        <Field label="対象年月">
          <Input
            type="month"
            value={item.targetMonth}
            disabled={!item.enabled}
            onChange={(event) => onUpdate(index, { targetMonth: event.target.value })}
          />
        </Field>
      </div>
    </article>
  );
}

function findClubId(sourceType: ParsedStatement['sourceType'], clubs: Club[]): number | null {
  const keyword = sourceType === 'lord' ? 'ロード' : 'シルク';
  const matches = clubs.filter((club) =>
    `${club.name} ${club.shortName ?? ''}`.normalize('NFKC').includes(keyword),
  );
  return matches.length === 1 ? (matches[0]?.id ?? null) : null;
}
