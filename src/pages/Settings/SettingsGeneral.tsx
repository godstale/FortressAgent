// TODO(Phase4): persist to SQLite app_settings

import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/context/ThemeContext';
import { cn } from '@/lib/utils';

export function SettingsGeneral() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6 select-none">
      <div>
        <h2 className="text-lg font-bold">일반 설정</h2>
        <p className="text-xs text-muted-foreground mt-1">
          앱의 시각적 테마와 기본 인터페이스 옵션을 설정합니다.
        </p>
      </div>

      <div className="border border-border rounded-xl p-5 bg-card/40 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">테마 선택</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            어두운 테마 또는 밝은 테마를 선택할 수 있습니다.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setTheme('dark')}
            className={cn(
              'flex flex-col items-center gap-2 h-20 transition-colors',
              theme === 'dark'
                ? 'border-primary bg-accent/40 text-foreground font-semibold'
                : 'text-muted-foreground',
            )}
          >
            <Moon className={cn('h-5 w-5', theme === 'dark' && 'text-primary')} />
            <span className="text-xs">다크 모드</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => setTheme('light')}
            className={cn(
              'flex flex-col items-center gap-2 h-20 transition-colors',
              theme === 'light'
                ? 'border-primary bg-accent/40 text-foreground font-semibold'
                : 'text-muted-foreground',
            )}
          >
            <Sun className={cn('h-5 w-5', theme === 'light' && 'text-primary')} />
            <span className="text-xs">라이트 모드</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => setTheme('system')}
            className={cn(
              'flex flex-col items-center gap-2 h-20 transition-colors',
              theme === 'system'
                ? 'border-primary bg-accent/40 text-foreground font-semibold'
                : 'text-muted-foreground',
            )}
          >
            <Monitor className={cn('h-5 w-5', theme === 'system' && 'text-primary')} />
            <span className="text-xs">시스템 설정</span>
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-xl p-5 bg-card/40 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">언어 (Language)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            UI 표시 언어를 설정합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="default" size="sm" className="text-xs">
            한국어
          </Button>
          <Button variant="outline" size="sm" className="text-xs text-muted-foreground">
            English
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SettingsGeneral;
