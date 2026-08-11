import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { type FormEvent } from 'react';

import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { Input, Select, Textarea } from '@/components/form';
import { PageHeader, Panel, StatusBadge } from '@/components/page';
import { Button } from '@/components/ui/button';
import { apiList, apiRequest, currentDate, patchJson, postJson } from '@/lib/api';
import type { Category, Club, NotificationItem } from '@/types';

interface AlertRule {
  id: number;
  ruleType: string;
  conditionJson: string;
  isEnabled: boolean;
}

export function SettingsPage() {
  const client = useQueryClient();
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
  const today = currentDate();
  const fiveYearsAgo = `${Number(today.slice(0, 4)) - 5}${today.slice(4)}`;
  return (
    <div className="grid gap-6">
      <PageHeader
        title="設定"
        description="クラブ、カテゴリー、アプリ内アラート、CSV出力を管理します。"
      />
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
            {clubs.data?.data.map((club) => (
              <div key={club.id} className="rounded border p-3 text-sm">
                <strong>{club.name}</strong>
                {club.shortName ? (
                  <span className="ml-2 text-muted-foreground">{club.shortName}</span>
                ) : null}
              </div>
            ))}
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
            {categories.data?.map((item) => (
              <div key={item.id} className="flex justify-between rounded border p-3 text-sm">
                <span>{item.name}</span>
                <StatusBadge tone={item.categoryType === 'income' ? 'success' : 'neutral'}>
                  {item.categoryType === 'expense' ? '支出' : '入金'}
                </StatusBadge>
              </div>
            ))}
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
                <span>{rule.ruleType}</span>
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
