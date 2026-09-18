use std::path::Path;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileTreeNode>>,
}

fn read_dir_recursive(dir: &Path) -> Result<Vec<FileTreeNode>, String> {
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            !name.starts_with('.') && name != "node_modules" && name != "target"
        })
        .collect();

    entries.sort_by(|a, b| {
        let a_is_dir = a.path().is_dir();
        let b_is_dir = b.path().is_dir();
        if a_is_dir != b_is_dir {
            if a_is_dir {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        } else {
            a.file_name().cmp(&b.file_name())
        }
    });

    entries
        .into_iter()
        .map(|entry| {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = path.is_dir();
            let children = if is_dir {
                Some(read_dir_recursive(&path)?)
            } else {
                None
            };
            Ok(FileTreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir,
                children,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn pick_project_folder<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_folder(move |folder_path| {
        let _ = tx.send(folder_path);
    });

    tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(|e| e.to_string())?
        .map(|picked| picked.map(|p| p.to_string()))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_project_folder_tree(folder_path: String) -> Result<FileTreeNode, String> {
    let root = Path::new(&folder_path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", folder_path));
    }
    Ok(FileTreeNode {
        name: root
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| folder_path.clone()),
        path: folder_path.clone(),
        is_dir: true,
        children: Some(read_dir_recursive(root)?),
    })
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(target, contents).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if target.exists() {
        return Err(format!("이미 파일이 존재합니다: {}", path));
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(target, []).map_err(|e| format!("Failed to create {}: {}", path, e))
}

#[tauri::command]
pub fn create_folder(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if target.exists() {
        return Err(format!("이미 폴더가 존재합니다: {}", path));
    }
    std::fs::create_dir_all(target).map_err(|e| format!("Failed to create {}: {}", path, e))
}

#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    let to_path = Path::new(&to);
    if to_path.exists() {
        return Err(format!("이미 대상 경로가 존재합니다: {}", to));
    }
    std::fs::rename(&from, &to).map_err(|e| format!("Failed to rename {}: {}", from, e))
}

#[tauri::command]
pub fn delete_path(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if target.is_dir() {
        std::fs::remove_dir_all(target).map_err(|e| format!("Failed to delete {}: {}", path, e))
    } else {
        std::fs::remove_file(target).map_err(|e| format!("Failed to delete {}: {}", path, e))
    }
}
