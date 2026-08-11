import { useQuery } from '@tanstack/react-query';
import { formatYen } from '@horse-asset-manager/shared';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ErrorState, LoadingState } from '@/components/feedback';
import { Input, Select } from '@/components/form';
import { PageHeader, Panel } from '@/components/page';
import { apiRequest, currentMonth } from '@/lib/api';
import type { AnalyticsRow } from '@/types';

const labels: Record<string, string> = {
  horse: '馬別',
  club: 'クラブ別',
  category: 'カテゴリー別',
  month: '月別',
};

export function AnalyticsPage() {
  const [kind, setKind] = useState('horse');
  const year = currentMonth().slice(0, 4);
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const path = kind === 'month' ? 'monthly' : `by-${kind}`;
  const query = useQuery({
    queryKey: ['analytics', kind, from, to],
    queryFn: () => apiRequest<AnalyticsRow[]>(`/api/analytics/${path}?from=${from}&to=${to}`),
  });
  return (
    <div className="grid gap-6">
      <PageHeader
        title="分析"
        description="確定収支だけを使い、馬・クラブ・カテゴリー・月ごとのお金の流れを比較します。"
        actions={
          <div className="grid gap-2 sm:grid-cols-3">
            <Select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="horse">馬別</option>
              <option value="club">クラブ別</option>
              <option value="category">カテゴリー別</option>
              <option value="month">月別</option>
            </Select>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
        }
      />
      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : (
        <>
          <Panel title={`${labels[kind]}の支出・入金`}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={query.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={kind === 'month' ? 'period' : 'name'} />
                <YAxis tickFormatter={(value: number) => `${Math.round(value / 10000)}万`} />
                <Tooltip formatter={(value) => formatYen(Number(value))} />
                <Legend />
                <Bar dataKey="expenseYen" name="支出" fill="#b7791f" radius={[4, 4, 0, 0]} />
                <Bar dataKey="incomeYen" name="入金" fill="#2f855a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <Panel>
            <div className="grid gap-3 md:hidden">
              {query.data?.map((row, index) => (
                <article
                  key={`${row.id ?? row.period}-${index}`}
                  className="grid gap-3 rounded-lg border p-4 text-sm"
                >
                  <strong className="break-words">{row.name ?? row.period ?? '未設定'}</strong>
                  <dl className="grid gap-2">
                    <SummaryRow label="支出" value={formatYen(row.expenseYen)} />
                    <SummaryRow label="入金" value={formatYen(row.incomeYen)} />
                    <SummaryRow label="差引損益" value={formatYen(row.profitLossYen)} />
                    <SummaryRow
                      label="総合回収率"
                      value={
                        row.totalRecoveryRate == null
                          ? '未算出'
                          : `${row.totalRecoveryRate.toFixed(1)}%`
                      }
                    />
                  </dl>
                </article>
              ))}
            </div>
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2">対象</th>
                    <th className="text-right">支出</th>
                    <th className="text-right">入金</th>
                    <th className="text-right">差引損益</th>
                    <th className="text-right">総合回収率</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data?.map((row, index) => (
                    <tr key={`${row.id ?? row.period}-${index}`} className="border-b">
                      <td className="py-3 font-medium">{row.name ?? row.period ?? '未設定'}</td>
                      <td className="text-right">{formatYen(row.expenseYen)}</td>
                      <td className="text-right">{formatYen(row.incomeYen)}</td>
                      <td className="text-right">{formatYen(row.profitLossYen)}</td>
                      <td className="text-right">
                        {row.totalRecoveryRate == null
                          ? '未算出'
                          : `${row.totalRecoveryRate.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}
