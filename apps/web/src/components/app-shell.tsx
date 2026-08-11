import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  CalendarDays,
  CircleDollarSign,
  Gauge,
  List,
  LogOut,
  Menu,
  PiggyBank,
  Settings,
  WalletCards,
} from 'lucide-react';
import { useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { ErrorState, LoadingState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ApiClientError, apiRequest, postJson } from '@/lib/api';
import type { User } from '@/types';

const navigation = [
  { to: '/dashboard', label: 'ダッシュボード', icon: Gauge },
  { to: '/prospects', label: '出資検討', icon: WalletCards },
  { to: '/horses', label: '出資馬管理', icon: List },
  { to: '/cashflows', label: '収支管理', icon: CircleDollarSign },
  { to: '/scheduled', label: '支払い予定', icon: CalendarDays },
  { to: '/budgets', label: '予算・出資計画', icon: PiggyBank },
  { to: '/analytics', label: '分析', icon: BarChart3 },
  { to: '/settings/clubs', label: '設定', icon: Settings },
] as const;

function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiRequest<User>('/api/auth/me'),
    retry: false,
  });
}

function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <img className="size-9 shrink-0" src="/brand/brand-mark.svg" alt="" />
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold tracking-wider text-primary">HORSE ASSET</p>
        <p className="truncate font-bold">資金管理</p>
      </div>
    </div>
  );
}

function NavigationLinks({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  return (
    <nav aria-label="メインメニュー" className="grid gap-1">
      {navigation.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}`
          }
        >
          <Icon className="size-4 shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function AccountSummary({ user }: { user: User }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">{user.name}</p>
      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
    </div>
  );
}

export function ProtectedLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const me = useMe();
  const logout = useMutation({
    mutationFn: () => postJson('/api/auth/logout', {}),
    onSuccess: () => {
      queryClient.clear();
      navigate('/login');
    },
  });
  if (me.isLoading)
    return (
      <main className="grid min-h-screen place-items-center">
        <LoadingState label="利用者情報を確認しています…" />
      </main>
    );
  if (me.error instanceof ApiClientError && me.error.status === 401)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (me.error)
    return (
      <main className="grid min-h-screen place-items-center p-8">
        <ErrorState error={me.error} />
      </main>
    );
  if (me.data && !me.data.setupCompleted) return <Navigate to="/setup" replace />;
  if (!me.data) return null;
  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r bg-sidebar px-4 py-5 text-sidebar-foreground lg:flex">
        <div className="px-3">
          <Brand />
        </div>
        <div className="mt-8">
          <NavigationLinks />
        </div>
        <div className="mt-auto border-t pt-4">
          <div className="mb-3 flex items-center justify-between px-3">
            <AccountSummary user={me.data} />
            <NavLink
              to="/notifications"
              aria-label="お知らせ"
              className="rounded-md p-2 hover:bg-secondary"
            >
              <Bell className="size-4" />
            </NavLink>
          </div>
          <Button variant="ghost" className="w-full justify-start" onClick={() => logout.mutate()}>
            <LogOut />
            ログアウト
          </Button>
        </div>
      </aside>
      <div className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <NavLink
            to="/notifications"
            aria-label="お知らせ"
            className="grid size-11 place-items-center rounded-md hover:bg-secondary"
          >
            <Bell className="size-5" />
          </NavLink>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="メニューを開く">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetTitle className="pr-12">
                <Brand />
              </SheetTitle>
              <SheetDescription className="sr-only">
                Horse Asset Managerのメインメニューです。
              </SheetDescription>
              <div className="mt-8">
                <NavigationLinks onNavigate={() => setMobileOpen(false)} />
              </div>
              <div className="mt-auto border-t pt-4">
                <div className="mb-3 px-3">
                  <AccountSummary user={me.data} />
                </div>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => logout.mutate()}
                >
                  <LogOut />
                  ログアウト
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <main className="min-w-0 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-[1320px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function SetupGuard() {
  const me = useMe();
  if (me.isLoading)
    return (
      <main className="grid min-h-screen place-items-center">
        <LoadingState />
      </main>
    );
  if (me.error) return <Navigate to="/login" replace />;
  if (me.data?.setupCompleted) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
