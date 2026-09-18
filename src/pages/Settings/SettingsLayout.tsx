import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sliders, Cpu, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { path: '/settings', label: '일반 (테마/언어)', icon: Sliders, end: true },
  { path: '/settings/model', label: '모델 및 LLM', icon: Cpu, end: false },
  { path: '/settings/approval', label: '도구 승인 정책', icon: ShieldCheck, end: false },
];

export function SettingsLayout() {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden">
      {/* Settings Left Navigation Sidebar */}
      <div className="w-64 border-r border-border bg-card/40 flex flex-col justify-between p-4 shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-6">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => navigate('/')}
              title="워크스페이스로 돌아가기"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-base font-bold tracking-tight">환경 설정</h1>
          </div>

          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ path, label, icon: Icon, end }) => (
              <NavLink
                key={path}
                to={path}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="text-[11px] text-muted-foreground p-2 border-t border-border">
          <p className="font-semibold text-foreground">Fortress v0.1.0</p>
          <p className="opacity-70 mt-0.5">로컬 AI 에이전트 워크스테이션</p>
        </div>
      </div>

      {/* Main Settings Content Form Area */}
      <div className="flex-1 overflow-y-auto p-8 max-w-3xl">
        <Outlet />
      </div>
    </div>
  );
}

export default SettingsLayout;
