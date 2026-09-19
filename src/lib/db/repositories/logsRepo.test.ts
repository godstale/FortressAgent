import { describe, it, expect, beforeEach } from 'vitest';
import { MemorySqlFallback } from '@/lib/db/client';
import * as logsRepo from './logsRepo';
import { appLogger } from '@/lib/logger/logger';

describe('logsRepo and execution_logs persistence', () => {
  let db: MemorySqlFallback;

  beforeEach(() => {
    db = new MemorySqlFallback();
  });

  it('inserts and retrieves execution log entries', async () => {
    await logsRepo.insertLogEntry(
      {
        id: 'log-1',
        timestamp: '2026-09-19T10:00:00.000Z',
        level: 'info',
        category: 'chat',
        message: '사용자 입력 수신',
        details: { prompt: '안녕' },
        sessionId: 'session-1',
        agentId: 'agent-1',
      },
      db,
    );

    await logsRepo.insertLogEntry(
      {
        id: 'log-2',
        timestamp: '2026-09-19T10:00:01.000Z',
        level: 'info',
        category: 'tools',
        message: '도구 실행 시작',
        details: { tool: 'web_search' },
        sessionId: 'session-1',
        agentId: 'agent-1',
      },
      db,
    );

    await logsRepo.insertLogEntry(
      {
        id: 'log-3',
        timestamp: '2026-09-19T10:00:02.000Z',
        level: 'info',
        category: 'chat',
        message: '다른 세션 로그',
        sessionId: 'session-2',
      },
      db,
    );

    const session1Logs = await logsRepo.getLogs({ sessionId: 'session-1' }, db);
    expect(session1Logs).toHaveLength(2);
    expect(session1Logs[0].message).toBe('사용자 입력 수신');
    expect(session1Logs[0].details).toEqual({ prompt: '안녕' });
    expect(session1Logs[1].message).toBe('도구 실행 시작');

    const allLogs = await logsRepo.getLogs({}, db);
    expect(allLogs).toHaveLength(3);
  });

  it('clears logs for a specific session or all sessions', async () => {
    await logsRepo.insertLogEntry(
      {
        id: 'log-1',
        timestamp: '2026-09-19T10:00:00.000Z',
        level: 'info',
        category: 'chat',
        message: '세션 1 로그',
        sessionId: 'session-1',
      },
      db,
    );
    await logsRepo.insertLogEntry(
      {
        id: 'log-2',
        timestamp: '2026-09-19T10:00:01.000Z',
        level: 'info',
        category: 'chat',
        message: '세션 2 로그',
        sessionId: 'session-2',
      },
      db,
    );

    await logsRepo.clearLogs('session-1', db);
    const session1Remaining = await logsRepo.getLogs({ sessionId: 'session-1' }, db);
    expect(session1Remaining).toHaveLength(0);

    const session2Remaining = await logsRepo.getLogs({ sessionId: 'session-2' }, db);
    expect(session2Remaining).toHaveLength(1);

    await logsRepo.clearLogs(undefined, db);
    const allRemaining = await logsRepo.getLogs({}, db);
    expect(allRemaining).toHaveLength(0);
  });

  it('appLogger records entries in-memory and can filter by session', () => {
    appLogger.clear();
    appLogger.info('agent', '에이전트 시작', { test: true }, 'test-session-123');
    appLogger.error('tools', '도구 실패', { err: 'fail' }, 'test-session-123');
    appLogger.info('chat', '다른 세션', undefined, 'other-session');

    const sessionLogs = appLogger.getSessionLogs('test-session-123');
    expect(sessionLogs).toHaveLength(2);
    expect(sessionLogs[0].category).toBe('agent');
    expect(sessionLogs[1].level).toBe('error');
  });
});
