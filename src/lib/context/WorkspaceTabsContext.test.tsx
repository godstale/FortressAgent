import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  WorkspaceTabsProvider,
  useWorkspaceTabs,
} from './WorkspaceTabsContext';

describe('WorkspaceTabsContext', () => {
  it('does not duplicate tab when openTab is called with an existing id', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <WorkspaceTabsProvider>{children}</WorkspaceTabsProvider>
    );

    const { result } = renderHook(() => useWorkspaceTabs(), { wrapper });

    act(() => {
      result.current.openTab({
        id: 'editor:/path/to/file.ts',
        type: 'editor',
        title: 'file.ts',
      });
    });

    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeTabId).toBe('editor:/path/to/file.ts');

    // Call openTab again with same id
    act(() => {
      result.current.openTab({
        id: 'editor:/path/to/file.ts',
        type: 'editor',
        title: 'file.ts',
      });
    });

    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeTabId).toBe('editor:/path/to/file.ts');

    // Call openTab with a different id
    act(() => {
      result.current.openTab({
        id: 'editor:/path/to/other.ts',
        type: 'editor',
        title: 'other.ts',
      });
    });

    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.activeTabId).toBe('editor:/path/to/other.ts');

    // Close first tab
    act(() => {
      result.current.closeTab('editor:/path/to/other.ts');
    });

    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeTabId).toBe('editor:/path/to/file.ts');
  });
});
