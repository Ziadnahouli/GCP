#[cfg(feature = "desktop")]
use tauri::{CustomMenuItem, SystemTray, SystemTrayMenu, SystemTrayEvent};

#[cfg(feature = "desktop")]
fn main() {
    let quit = CustomMenuItem::new("quit".to_string(), "Quit Nexus");
    let hide = CustomMenuItem::new("hide".to_string(), "Hide to Tray");
    let tray_menu = SystemTrayMenu::new().add_item(hide).add_item(quit);
    let system_tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "quit" => {
                    std::process::exit(0);
                }
                "hide" => {
                    let window = app.get_window("main").unwrap();
                    window.hide().unwrap();
                }
                _ => {}
            },
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running Nexus Windows application");
}

#[cfg(not(feature = "desktop"))]
use vercel_runtime::{run, Body, Error, Request, Response, StatusCode};

#[cfg(not(feature = "desktop"))]
#[tokio::main]
async fn main() -> Result<(), Error> {
    run(handler).await
}

#[cfg(not(feature = "desktop"))]
pub async fn handler(_req: Request) -> Result<Response<Body>, Error> {
    let payload = serde_json::json!({
        "service": "src-tauri",
        "status": "online",
        "version": "0.2.0",
        "features": {
            "low_latency_telemetry": true,
            "system_audio_bridge": true,
            "zerotier_diagnostics": true
        },
        "timestamp": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    });

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(payload.to_string().into())?)
}
