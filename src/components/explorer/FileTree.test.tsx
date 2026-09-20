import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileTree } from './FileTree';
import { WorkspaceTabsProvider } from '@/lib/context/WorkspaceTabsContext';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@/lib/context/WorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/context/WorkspaceContext')>();
  const mockVal = {
    workspaceRoot: '/path/to/project',
    setWorkspaceRoot: vi.fn(),
    isTrusted: true,
    trustCurrentWorkspace: vi.fn(),
    rejectCurrentWorkspace: vi.fn(),
    recentWorkspaces: [],
    trustModalOpen: false,
    setTrustModalOpen: vi.fn(),
  };
  return {
    ...actual,
    useWorkspace: () => mockVal,
    useSafeWorkspace: () => mockVal,
  };
});

describe('FileTree Context Menus', () => {
  const mockTree = {
    name: 'test-project',
    path: '/path/to/project',
    is_dir: true,
    children: [
      {
        name: 'sample.txt',
        path: '/path/to/project/sample.txt',
        is_dir: false,
      },
      {
        name: 'subfolder',
        path: '/path/to/project/subfolder',
        is_dir: true,
        children: [],
      },
    ],
  };

  const renderComponent = () => {
    return render(
      <WorkspaceTabsProvider>
        <FileTree />
      </WorkspaceTabsProvider>,
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'read_project_folder_tree') {
        return mockTree;
      }
      return null;
    });
  });

  it('renders file context menu items on right clicking a file', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('sample.txt')).toBeInTheDocument();
    });

    const fileItem = screen.getByText('sample.txt');
    fireEvent.contextMenu(fileItem);

    expect(screen.getByRole('button', { name: /Open/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cut/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Paste/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rename/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reveal in file explorer/i })).toBeInTheDocument();
  });

  it('renders empty space context menu items on right clicking empty space', async () => {
    const { container } = renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('test-project').length).toBeGreaterThan(0);
    });

    // Right click on the container root or empty body area
    const explorerContainer = container.firstElementChild!;
    fireEvent.contextMenu(explorerContainer);

    expect(screen.getByRole('button', { name: /New file/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New folder/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Convert to tree\/list view/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fold\/Unfold all folders/i })).toBeInTheDocument();
  });

  it('closes context menu when Escape key is pressed', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('sample.txt')).toBeInTheDocument();
    });

    const fileItem = screen.getByText('sample.txt');
    fireEvent.contextMenu(fileItem);

    expect(screen.getByRole('button', { name: /Reveal in file explorer/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('button', { name: /Reveal in file explorer/i })).not.toBeInTheDocument();
  });
});
