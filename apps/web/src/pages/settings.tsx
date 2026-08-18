import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { Input, Select, Textarea } from '@/components/form';
import { PageHeader, Panel, StatusBadge } from '@/components/page';
import { Button } from '@/components/ui/button';
import { apiList, apiRequest, currentDate, deleteRequest, patchJson, postJson } from '@/lib/api';
import type { Category, Club, NotificationItem } from '@/types';

interface AlertRule {
  id: number;
  ruleType: string;
  conditionJson: string;
  isEnabled: boolean;
}

export function SettingsPage() {
  const client = useQueryClient();
  const [editingClubId, setEditingClubId] = useState<number | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const clubs = useQuery({
    queryKey: ['clubs'],
    queryFn: () => apiList<Club>('/api/clubs?pageSize=100'),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiRequest<Category[]>('/api/categories'),
  });
  const alerts = useQuery({
    queryKey: ['alert-rules'],
    queryFn: () => apiRequest<AlertRule[]>('/api/alert-rules'),
  });
  const addClub = useMutation({
    mutationFn: (body: unknown) => postJson('/api/clubs', body),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['clubs'] }),
  });
  const addCategory = useMutation({
    mutationFn: (body: unknown) => postJson('/api/categories', body),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['categories'] }),
  });
  const updateClub = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) =>
      patchJson(`/api/clubs/${id}`, body),
    onSuccess: () => {
      setEditingClubId(null);
      void client.invalidateQueries({ queryKey: ['clubs'] });
    },
  });
  const deleteClub = useMutation({
    mutationFn: (id: number) => deleteRequest(`/api/clubs/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['clubs'] }),
  });
  const updateCategory = useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) =>
      patchJson(`/api/categories/${id}`, body),
    onSuccess: () => {
      setEditingCategoryId(null);
      void client.invalidateQueries({ queryKey: ['categories'] });
    },
  });
  const deleteCategory = useMutation({
    mutationFn: (id: number) => deleteRequest(`/api/categories/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['categories'] }),
  });
  const toggleAlert = useMutation({
    mutationFn: ({
      id,
      enabled,
      condition,
    }: {
      id: number;
      enabled: boolean;
      condition: Record<string, string | number | boolean>;
    }) => patchJson(`/api/alert-rules/${id}`, { isEnabled: enabled, condition }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['alert-rules'] }),
  });
  function clubSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    addClub.mutate({
      name: f.get('name'),
      shortName: f.get('shortName') || null,
      description: f.get('description') || null,
    });
    event.currentTarget.reset();
  }
  function categorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    addCategory.mutate({
      name: f.get('name'),
      categoryType: f.get('categoryType'),
      parentId: null,
      sortOrder: 100,
    });
    event.currentTarget.reset();
  }
  function clubUpdateSubmit(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    updateClub.mutate({
      id,
      body: {
        name: f.get('name'),
        shortName: f.get('shortName') || null,
        description: f.get('description') || null,
      },
    });
  }
  function categoryUpdateSubmit(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    updateCategory.mutate({
      id,
      body: {
        name: f.get('name'),
        categoryType: f.get('categoryType'),
        sortOrder: Number(f.get('sortOrder')),
      },
    });
  }
  const today = currentDate();
  const fiveYearsAgo = `${Number(today.slice(0, 4)) - 5}${today.slice(4)}`;
  return (
    <div className="grid gap-6">
      <PageHeader
        title="設定"
        description="クラブ、カテゴリー、アプリ内アラート、CSV出力を管理します。"
      />
      {addClub.error ||
      addCategory.error ||
      updateClub.error ||
      updateCategory.error ||
      deleteClub.error ||
      deleteCategory.error ? (
        <ErrorState
          error={
            addClub.error ??
            addCategory.error ??
            updateClub.error ??
            updateCategory.error ??
            deleteClub.error ??
            deleteCategory.error
          }
        />
      ) : null}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="クラブ">
          <form className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={clubSubmit}>
            <Input name="name" placeholder="クラブ名" required />
            <Input name="shortName" placeholder="略称（任意）" />
            <Textarea className="sm:col-span-2" name="description" placeholder="メモ" />
            <Button className="sm:col-span-2" type="submit">
              <Plus />
              追加
            </Button>
          </form>
          <div className="grid gap-2">
            {clubs.data?.data.map((club) =>
              editingClubId === club.id ? (
                <form
                  key={club.id}
                  className="grid gap-2 rounded border p-3"
                  onSubmit={(event) => clubUpdateSubmit(event, club.id)}
                >
                  <Input name="name" defaultValue={club.name} required aria-label="クラブ名" />
                  <Input
                    name="shortName"
                    defaultValue={club.shortName ?? ''}
                    placeholder="略称"
                    aria-label="略称"
                  />
                  <Textarea
                    name="description"
                    defaultValue={club.description ?? ''}
                    placeholder="メモ"
                    aria-label="メモ"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm">
                      保存
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingClubId(null)}
                    >
                      取消
                    </Button>
                  </div>
                </form>
              ) : (
                <div
                  key={club.id}
                  className="flex items-center justify-between gap-3 rounded border p-3 text-sm"
                >
                  <div>
                    <strong>{club.name}</strong>
                    {club.shortName ? (
                      <span className="ml-2 text-muted-foreground">{club.shortName}</span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${club.name}を編集`}
                      onClick={() => setEditingClubId(club.id)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${club.name}を削除`}
                      onClick={() => {
                        if (
                          window.confirm(
                            `「${club.name}」を削除します。使用中のクラブは削除できません。`,
                          )
                        )
                          deleteClub.mutate(club.id);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ),
            )}
          </div>
        </Panel>
        <Panel title="収支カテゴリー">
          <form
            className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_auto]"
            onSubmit={categorySubmit}
          >
            <Input name="name" placeholder="カテゴリー名" required />
            <Select name="categoryType">
              <option value="expense">支出</option>
              <option value="income">入金</option>
            </Select>
            <Button type="submit">追加</Button>
          </form>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {categories.data?.map((item) =>
              editingCategoryId === item.id ? (
                <form
                  key={item.id}
                  className="grid gap-2 rounded border p-3"
                  onSubmit={(event) => categoryUpdateSubmit(event, item.id)}
                >
                  <Input name="name" defaultValue={item.name} required aria-label="カテゴリー名" />
                  <Select
                    name="categoryType"
                    defaultValue={item.categoryType}
                    aria-label="収支種別"
                  >
                    <option value="expense">支出</option>
                    <option value="income">入金</option>
                  </Select>
                  <Input
                    name="sortOrder"
                    type="number"
                    min="0"
                    defaultValue={item.sortOrder}
                    aria-label="並び順"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm">
                      保存
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingCategoryId(null)}
                    >
                      取消
                    </Button>
                  </div>
                </form>
              ) : (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded border p-3 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{item.name}</span>
                    <StatusBadge tone={item.categoryType === 'income' ? 'success' : 'neutral'}>
                      {item.categoryType === 'expense' ? '支出' : '入金'}
                    </StatusBadge>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${item.name}を編集`}
                      onClick={() => setEditingCategoryId(item.id)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`${item.name}を削除`}
                      onClick={() => {
                        if (
                          window.confirm(
                            `「${item.name}」を削除します。使用中のカテゴリーは削除できません。`,
                          )
                        )
                          deleteCategory.mutate(item.id);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ),
            )}
          </div>
        </Panel>
      </div>
      <Panel title="アプリ内アラート">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {alerts.data?.map((rule) => {
            const condition = JSON.parse(rule.conditionJson) as Record<
              string,
              string | number | boolean
            >;
            return (
              <label
                key={rule.id}
                className="flex min-h-14 items-center justify-between gap-3 rounded border p-4 text-sm"
              >
                <span>{alertRuleLabel(rule.ruleType)}</span>
                <input
                  type="checkbox"
                  checked={rule.isEnabled}
                  onChange={(event) =>
                    toggleAlert.mutate({ id: rule.id, enabled: event.target.checked, condition })
                  }
                />
              </label>
            );
          })}
        </div>
      </Panel>
      <Panel title="CSV出力">
        <p className="mb-4 text-sm text-muted-foreground">
          最大5年分、50,000行まで。Excelで開きやすい日本語見出し・UTF-8 BOM形式です。
        </p>
        <div className="flex flex-wrap gap-3">
          {[
            ['cashflows', '収支'],
            ['analytics-by-horse', '馬別'],
            ['analytics-by-club', 'クラブ別'],
            ['analytics-monthly', '月別'],
            ['analytics-yearly', '年別'],
          ].map(([path, label]) => (
            <a
              key={path}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-secondary sm:w-auto"
              href={`/api/export/${path}.csv?from=${fiveYearsAgo}&to=${today}`}
            >
              <Download className="size-4" />
              {label}CSV
            </a>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function alertRuleLabel(ruleType: string): string {
  return (
    {
      due_date: '支払期限が近いとき',
      deadline: '募集締切が近いとき',
      budget: '年間予算に近づいた・超過したとき',
      input_missing: '支払い実績の入力が遅れているとき',
      concentration: '特定クラブへの支出が集中したとき',
    }[ruleType] ?? 'その他のアラート'
  );
}

export function NotificationsPage() {
  const client = useQueryClient();
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiList<NotificationItem>('/api/notifications?pageSize=100'),
  });
  const read = useMutation({
    mutationFn: (id: number) => patchJson(`/api/notifications/${id}/read`, {}),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['notifications'] }),
  });
  return (
    <div className="grid gap-6">
      <PageHeader
        title="お知らせ"
        description="期限、予算、入力漏れなど資金管理に必要なアプリ内通知です。"
      />
      {notifications.isLoading ? (
        <LoadingState />
      ) : notifications.error ? (
        <ErrorState error={notifications.error} />
      ) : notifications.data?.data.length ? (
        <div className="grid gap-3">
          {notifications.data.data.map((item) => (
            <button
              key={item.id}
              className={`rounded-xl border p-4 text-left ${item.isRead ? 'bg-card' : 'border-amber-300 bg-amber-50'}`}
              onClick={() => read.mutate(item.id)}
            >
              <div className="grid gap-1 sm:flex sm:justify-between">
                <strong className="break-words">{item.title}</strong>
                <span className="text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString('ja-JP')}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{item.message}</p>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState>お知らせはありません。</EmptyState>
      )}
    </div>
  );
}
