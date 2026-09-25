import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders as render } from '@/test-utils';
import '@testing-library/jest-dom/vitest';
import { MessageBubble } from './MessageBubble';
import { captureChatConfigSnapshot } from '@/lib/types/agent';
import { DEFAULT_AGENT } from '@/lib/agent/defaultAgent';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('MessageBubble run-config info (P9-06)', () => {
  it('shows an [i] button under a user bubble and reveals the snapshot on click', () => {
    const snapshot = captureChatConfigSnapshot(DEFAULT_AGENT);
    render(
      <MessageBubble
        message={{ role: 'user', content: 'Hello', config: snapshot }}
      />,
    );

    const infoButton = screen.getByTitle('이 요청의 실행 설정 보기');
    expect(infoButton).toBeInTheDocument();
    expect(screen.queryByText('실행 설정')).not.toBeInTheDocument();

    fireEvent.click(infoButton);
    expect(screen.getByText('실행 설정')).toBeInTheDocument();
    expect(screen.getByText(`${DEFAULT_AGENT.name} • ${DEFAULT_AGENT.model}`)).toBeInTheDocument();
  });

  it('falls back to the current settings for legacy messages without a snapshot', () => {
    const fallback = captureChatConfigSnapshot(DEFAULT_AGENT);
    render(
      <MessageBubble
        message={{ role: 'user', content: 'Legacy question' }}
        fallbackConfig={fallback}
      />,
    );

    fireEvent.click(screen.getByTitle('이 요청의 실행 설정 보기'));
    expect(screen.getByText('이전 대화이므로 현재 설정을 표시합니다')).toBeInTheDocument();
  });

  it('renders a config-change notice as a centered badge', () => {
    const snapshot = captureChatConfigSnapshot(DEFAULT_AGENT, { reasoning: 'off' }, false);
    render(
      <MessageBubble
        message={{ role: 'system', content: '⚙️ 실행 설정이 변경되었습니다', config: snapshot }}
      />,
    );

    expect(screen.getByText('⚙️ 실행 설정이 변경되었습니다')).toBeInTheDocument();
    expect(screen.getByText('off')).toBeInTheDocument();
  });
});
