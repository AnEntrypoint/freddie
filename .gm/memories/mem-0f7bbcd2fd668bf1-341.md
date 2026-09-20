---
key: mem-0f7bbcd2fd668bf1-341
ns: default
created: 1789887705691
updated: 1789887705691
---

## Resolved mutable: windows-in-watch

type-shape: crates/agentplug-runner/Cargo.toml:25 already depends on windows-sys 0.59. Idle wait will use FindFirstChangeNotificationW + WaitForSingleObject timeout 25ms via extra Win32_Storage_FileSystem and Win32_System_Threading features. No notify crate. Unix keeps sleep cap after in-dir re-scan.
