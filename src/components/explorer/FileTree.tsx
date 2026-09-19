import { useState, useCallback, useMemo, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderPlus,
  FilePlus,
  RefreshCw,
  List,
  ListTree,
  Trash2,
  Edit2,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWorkspaceTabs } from '@/lib/context/WorkspaceTabsContext';
import { useWorkspace } from '@/lib/context/WorkspaceContext';
import type { FileTreeNode } from '@/lib/types/fileTree';
import { cn } from '@/lib/utils';
import { getFileIcon } from '@/lib/fileIcons';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);

function isImageFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return Boolean(ext) && IMAGE_EXTENSIONS.has(ext!);
}

export function FileTree() {
  const { openTab } = useWorkspaceTabs();
  const { workspaceRoot, setWorkspaceRoot } = useWorkspace();
  const workspacePath = workspaceRoot;
  const [tree, setTree] = useState<FileTreeNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');
  const [loading, setLoading] = useState(false);

  // Inline creation / rename state
  const [creatingIn, setCreatingIn] = useState<{
    dirPath: string;
    type: 'file' | 'folder';
  } | null>(null);
  const [creatingName, setCreatingName] = useState('');
  const [renamingNode, setRenamingNode] = useState<FileTreeNode | null>(null);
  const [renamingName, setRenamingName] = useState('');

  const loadTree = useCallback(async (dirPath: string) => {
    setLoading(true);
    try {
      const res = await invoke<FileTreeNode>('read_project_folder_tree', {
        folderPath: dirPath,
      });
      setTree(res);
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(dirPath);
        return next;
      });
    } catch (err) {
      console.error('Failed to read project tree:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      if (workspaceRoot) {
        await loadTree(workspaceRoot);
      } else {
        setTree(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [workspaceRoot, loadTree]);

  const handlePickFolder = async () => {
    try {
      const picked = await invoke<string | null>('pick_project_folder');
      if (picked) {
        setWorkspaceRoot(picked);
      }
    } catch (err) {
      console.error('Failed to pick project folder:', err);
    }
  };


  const toggleExpand = (dirPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  const handleNodeClick = (node: FileTreeNode) => {
    if (node.is_dir) {
      toggleExpand(node.path);
    } else {
      if (isImageFile(node.name)) {
        openTab({
          id: `image-viewer:${node.path}`,
          type: 'image-viewer',
          title: node.name,
          meta: { filePath: node.path },
        });
      } else {
        openTab({
          id: `editor:${node.path}`,
          type: 'editor',
          title: node.name,
          meta: { filePath: node.path },
        });
      }
    }
  };

  const handleCreateSubmit = async () => {
    if (!creatingIn || !creatingName.trim()) {
      setCreatingIn(null);
      setCreatingName('');
      return;
    }
    const sep = creatingIn.dirPath.includes('\\') ? '\\' : '/';
    const targetPath = `${creatingIn.dirPath.replace(/[\\/]+$/, '')}${sep}${creatingName.trim()}`;

    try {
      if (creatingIn.type === 'file') {
        await invoke('create_file', { path: targetPath });
      } else {
        await invoke('create_folder', { path: targetPath });
      }
      if (workspacePath) {
        await loadTree(workspacePath);
      }
    } catch (err) {
      alert(`생성 실패: ${err}`);
    } finally {
      setCreatingIn(null);
      setCreatingName('');
    }
  };

  const handleRenameSubmit = async () => {
    if (!renamingNode || !renamingName.trim() || renamingName.trim() === renamingNode.name) {
      setRenamingNode(null);
      setRenamingName('');
      return;
    }
    const sep = renamingNode.path.includes('\\') ? '\\' : '/';
    const parent = renamingNode.path.substring(0, renamingNode.path.lastIndexOf(sep));
    const targetPath = `${parent}${sep}${renamingName.trim()}`;

    try {
      await invoke('rename_path', { from: renamingNode.path, to: targetPath });
      if (workspacePath) {
        await loadTree(workspacePath);
      }
    } catch (err) {
      alert(`이름 변경 실패: ${err}`);
    } finally {
      setRenamingNode(null);
      setRenamingName('');
    }
  };

  const handleDelete = async (node: FileTreeNode) => {
    const isConfirmed = window.confirm(`'${node.name}'을(를) 삭제하시겠습니까?`);
    if (!isConfirmed) return;

    try {
      await invoke('delete_path', { path: node.path });
      if (workspacePath) {
        await loadTree(workspacePath);
      }
    } catch (err) {
      alert(`삭제 실패: ${err}`);
    }
  };

  // Flattened file list for list view
  const flatFiles = useMemo(() => {
    if (!tree) return [];
    const list: FileTreeNode[] = [];
    function traverse(n: FileTreeNode) {
      if (!n.is_dir) {
        list.push(n);
      }
      if (n.children) {
        for (const c of n.children) traverse(c);
      }
    }
    traverse(tree);
    return list;
  }, [tree]);

  const filteredFlatFiles = useMemo(() => {
    if (!searchQuery.trim()) return flatFiles;
    const q = searchQuery.toLowerCase();
    return flatFiles.filter((f) => f.name.toLowerCase().includes(q));
  }, [flatFiles, searchQuery]);

  const renderTreeItem = (node: FileTreeNode, depth = 0) => {
    const isExpanded = expanded.has(node.path);
    const matchesSearch =
      !searchQuery.trim() || node.name.toLowerCase().includes(searchQuery.toLowerCase());

    if (!node.is_dir && !matchesSearch) {
      return null;
    }

    return (
      <div key={node.path} className="flex flex-col select-none">
        <DropdownMenu>
          <div
            className={cn(
              'flex items-center justify-between group px-1 py-1 hover:bg-accent/60 rounded cursor-pointer text-xs transition-colors',
            )}
            style={{ paddingLeft: `${depth * 14 + 6}px` }}
          >
            <div
              className="flex items-center gap-1.5 flex-1 min-w-0"
              onClick={() => handleNodeClick(node)}
            >
              {node.is_dir ? (
                <>
                  <span className="text-muted-foreground">
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </span>
                  {(() => {
                    const iconSpec = getFileIcon(node.name, true, isExpanded);
                    return (
                      <iconSpec.Icon
                        className="h-4 w-4 shrink-0"
                        style={{ color: iconSpec.color }}
                      />
                    );
                  })()}
                </>
              ) : (
                <>
                  <span className="w-3.5" />
                  {(() => {
                    const iconSpec = getFileIcon(node.name, false);
                    return (
                      <iconSpec.Icon
                        className="h-4 w-4 shrink-0"
                        style={{ color: iconSpec.color }}
                      />
                    );
                  })()}
                </>
              )}

              {renamingNode?.path === node.path ? (
                <input
                  type="text"
                  autoFocus
                  value={renamingName}
                  onChange={(e) => setRenamingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit();
                    if (e.key === 'Escape') setRenamingNode(null);
                  }}
                  onBlur={handleRenameSubmit}
                  className="bg-background border border-primary px-1 py-0.5 rounded text-xs w-full text-foreground outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="truncate">{node.name}</span>
              )}
            </div>

            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="옵션"
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-background rounded text-muted-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                •••
              </button>
            </DropdownMenuTrigger>
          </div>

          <DropdownMenuContent align="start" className="w-40 text-xs">
            {node.is_dir && (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    setCreatingIn({ dirPath: node.path, type: 'file' });
                    setCreatingName('');
                    if (!isExpanded) toggleExpand(node.path);
                  }}
                >
                  <FilePlus className="h-3.5 w-3.5 mr-2" /> 새 파일
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setCreatingIn({ dirPath: node.path, type: 'folder' });
                    setCreatingName('');
                    if (!isExpanded) toggleExpand(node.path);
                  }}
                >
                  <FolderPlus className="h-3.5 w-3.5 mr-2" /> 새 폴더
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem
              onClick={() => {
                setRenamingNode(node);
                setRenamingName(node.name);
              }}
            >
              <Edit2 className="h-3.5 w-3.5 mr-2" /> 이름 변경
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDelete(node)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> 삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {node.is_dir && isExpanded && (
          <div>
            {creatingIn?.dirPath === node.path && (
              <div
                className="flex items-center gap-1.5 px-1 py-1"
                style={{ paddingLeft: `${(depth + 1) * 14 + 6}px` }}
              >
                {creatingIn.type === 'folder' ? (
                  <Folder className="h-4 w-4 text-amber-400" />
                ) : (
                  <File className="h-4 w-4 text-muted-foreground" />
                )}
                <input
                  type="text"
                  autoFocus
                  placeholder={creatingIn.type === 'folder' ? '폴더명...' : '파일명...'}
                  value={creatingName}
                  onChange={(e) => setCreatingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateSubmit();
                    if (e.key === 'Escape') setCreatingIn(null);
                  }}
                  onBlur={handleCreateSubmit}
                  className="bg-background border border-primary px-1 py-0.5 rounded text-xs flex-1 text-foreground outline-none"
                />
              </div>
            )}
            {node.children?.map((child) => renderTreeItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-sidebar select-none min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <button
          type="button"
          onClick={handlePickFolder}
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 truncate hover:text-foreground hover:bg-accent/50 px-1.5 py-0.5 rounded transition-colors text-left"
          title="클릭하여 프로젝트 폴더 변경"
        >
          <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span className="truncate">{tree ? tree.name : '파일 탐색기'}</span>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          {tree && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setViewMode((v) => (v === 'tree' ? 'list' : 'tree'))}
                title={viewMode === 'tree' ? '목록 보기로 전환' : '트리 보기로 전환'}
              >
                {viewMode === 'tree' ? (
                  <List className="h-3.5 w-3.5" />
                ) : (
                  <ListTree className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => {
                  if (workspacePath) {
                    setCreatingIn({ dirPath: workspacePath, type: 'file' });
                    setCreatingName('');
                  }
                }}
                title="루트에 새 파일"
              >
                <FilePlus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => {
                  if (workspacePath) {
                    setCreatingIn({ dirPath: workspacePath, type: 'folder' });
                    setCreatingName('');
                  }
                }}
                title="루트에 새 폴더"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => workspacePath && loadTree(workspacePath)}
                disabled={loading}
                title="새로고침"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </Button>
            </>
          )}
        </div>
      </div>

      {!workspacePath ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground gap-3">
          <Folder className="h-10 w-10 opacity-30" />
          <p className="text-xs">선택된 프로젝트 폴더가 없습니다.</p>
          <Button size="sm" onClick={handlePickFolder} className="text-xs">
            폴더 열기
          </Button>
        </div>
      ) : (
        <>
          {/* Search bar */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="파일 검색..."
                className="h-7 pl-7 text-xs bg-background/50"
              />
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-1 font-mono text-xs">
            {creatingIn?.dirPath === workspacePath && (
              <div className="flex items-center gap-1.5 px-2 py-1">
                {creatingIn.type === 'folder' ? (
                  <Folder className="h-4 w-4 text-amber-400" />
                ) : (
                  <File className="h-4 w-4 text-muted-foreground" />
                )}
                <input
                  type="text"
                  autoFocus
                  placeholder={creatingIn.type === 'folder' ? '폴더명...' : '파일명...'}
                  value={creatingName}
                  onChange={(e) => setCreatingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateSubmit();
                    if (e.key === 'Escape') setCreatingIn(null);
                  }}
                  onBlur={handleCreateSubmit}
                  className="bg-background border border-primary px-1 py-0.5 rounded text-xs flex-1 text-foreground outline-none"
                />
              </div>
            )}

            {viewMode === 'tree' ? (
              tree ? (
                renderTreeItem(tree)
              ) : (
                <div className="p-4 text-center text-muted-foreground">로딩 중...</div>
              )
            ) : (
              <div className="flex flex-col gap-0.5">
                {filteredFlatFiles.map((file) => {
                  const iconSpec = getFileIcon(file.name, false);
                  return (
                    <div
                      key={file.path}
                      onClick={() => handleNodeClick(file)}
                      className="flex items-center gap-1.5 px-2 py-1 hover:bg-accent/60 rounded cursor-pointer"
                    >
                      <iconSpec.Icon
                        className="h-4 w-4 shrink-0"
                        style={{ color: iconSpec.color }}
                      />
                      <span className="truncate">{file.name}</span>
                    </div>
                  );
                })}
                {filteredFlatFiles.length === 0 && (
                  <div className="p-4 text-center text-muted-foreground">
                    검색 결과가 없습니다.
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default FileTree;
