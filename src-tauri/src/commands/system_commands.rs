use std::process::Command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemGpuInfo {
    pub gpu_name: String,
    pub vram_total_mb: u64,
    pub vram_used_mb: u64,
    pub vram_free_mb: u64,
    pub gpu_utilization_pct: f32,
    pub gpu_temperature_c: f32,
    pub is_nvidia: bool,
    pub system_memory_total_mb: u64,
    pub system_memory_free_mb: u64,
}

#[tauri::command]
pub async fn get_system_gpu_info() -> Result<SystemGpuInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut info = SystemGpuInfo {
            gpu_name: "Generic / CPU".to_string(),
            vram_total_mb: 0,
            vram_used_mb: 0,
            vram_free_mb: 0,
            gpu_utilization_pct: 0.0,
            gpu_temperature_c: 0.0,
            is_nvidia: false,
            system_memory_total_mb: 0,
            system_memory_free_mb: 0,
        };

        // 1. Try querying NVIDIA-SMI first
        let mut nvidia_cmd = Command::new("nvidia-smi");
        nvidia_cmd.args([
            "--query-gpu=name,memory.total,memory.free,memory.used,utilization.gpu,temperature.gpu",
            "--format=csv,noheader,nounits",
        ]);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            nvidia_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        if let Ok(output) = nvidia_cmd.output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Some(first_line) = stdout.lines().next() {
                    let parts: Vec<&str> = first_line.split(',').map(|s| s.trim()).collect();
                    if parts.len() >= 6 {
                        info.gpu_name = parts[0].to_string();
                        info.vram_total_mb = parts[1].parse().unwrap_or(0);
                        info.vram_free_mb = parts[2].parse().unwrap_or(0);
                        info.vram_used_mb = parts[3].parse().unwrap_or(0);
                        info.gpu_utilization_pct = parts[4].parse().unwrap_or(0.0);
                        info.gpu_temperature_c = parts[5].parse().unwrap_or(0.0);
                        info.is_nvidia = true;
                    }
                }
            }
        }

        // 2. If not NVIDIA or failed, fallback to OS video controller query
        if !info.is_nvidia {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                let mut ps_cmd = Command::new("powershell");
                ps_cmd.args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    "(Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name)",
                ]);
                ps_cmd.creation_flags(0x08000000);

                if let Ok(ps_out) = ps_cmd.output() {
                    if ps_out.status.success() {
                        let name = String::from_utf8_lossy(&ps_out.stdout).trim().to_string();
                        if !name.is_empty() {
                            info.gpu_name = name;
                        }
                    }
                }
            }
            #[cfg(target_os = "macos")]
            {
                let mut mac_cmd = Command::new("system_profiler");
                mac_cmd.args(["SPDisplaysDataType"]);
                if let Ok(mac_out) = mac_cmd.output() {
                    if mac_out.status.success() {
                        let text = String::from_utf8_lossy(&mac_out.stdout);
                        for line in text.lines() {
                            if line.contains("Chipset Model:") {
                                let model = line.replace("Chipset Model:", "").trim().to_string();
                                if !model.is_empty() {
                                    info.gpu_name = model;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            #[cfg(target_os = "linux")]
            {
                let mut lspci_cmd = Command::new("lspci");
                if let Ok(out) = lspci_cmd.output() {
                    let text = String::from_utf8_lossy(&out.stdout);
                    for line in text.lines() {
                        if line.contains("VGA compatible controller") || line.contains("3D controller") {
                            info.gpu_name = line.trim().to_string();
                            break;
                        }
                    }
                }
            }
        }

        // 3. System RAM info
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let mut ps_ram = Command::new("powershell");
            ps_ram.args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "$os = Get-CimInstance Win32_OperatingSystem; \"$($os.TotalVisibleMemorySize),$($os.FreePhysicalMemory)\"",
            ]);
            ps_ram.creation_flags(0x08000000);

            if let Ok(out) = ps_ram.output() {
                if out.status.success() {
                    let text = String::from_utf8_lossy(&out.stdout);
                    let parts: Vec<&str> = text.trim().split(',').collect();
                    if parts.len() == 2 {
                        let total_kb: u64 = parts[0].parse().unwrap_or(0);
                        let free_kb: u64 = parts[1].parse().unwrap_or(0);
                        info.system_memory_total_mb = total_kb / 1024;
                        info.system_memory_free_mb = free_kb / 1024;
                    }
                }
            }
        }

        Ok(info)
    })
    .await
    .map_err(|e| format!("Task execution failed: {}", e))?
}
