pub mod commands;

use commands::fs_commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_project_folder,
            read_project_folder_tree,
            read_text_file,
            write_text_file,
            create_file,
            create_folder,
            rename_path,
            delete_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
