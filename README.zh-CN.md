# Super Productivity Companion

这个仓库是一个桌面伴侣整合项目，用来把
[Super Productivity](https://super-productivity.com/) 和 Clawd on Desk
桌面宠物运行时连接起来。

Super Productivity 仍然是任务、计时器、提醒、每日进度和任务变更的事实来源。
Clawd 负责轻量桌面伴侣层：可见的桌面宠物、托盘/菜单操作、视觉状态变化，
以及一些桌面上的生产力提示。

## Windows 一键安装

面向普通用户的 release 会优先提供 Windows 组合安装包：

```text
Super-Productivity-Companion-Setup-x64.exe
Super-Productivity-Companion-Setup-arm64.exe
```

大多数 Windows 电脑使用 `x64` 版本；Windows on ARM 设备使用 `arm64` 版本。

组合安装包会安装并尝试启动：

- Super Productivity
- Clawd on Desk

在 companion 组合版中，Super Productivity 的桌面伴侣桥接默认启用。通信只发生在本机
`127.0.0.1`，Clawd 只能通过受限的 companion 命令集请求 Super Productivity 执行动作。

第一版组合安装包不做代码签名，因此 Windows SmartScreen 可能提示“未知发布者”。

## 功能概览

- 将 Super Productivity 桌面端状态以本地快照的形式发布给 Clawd。
- 根据 idle、working、paused、attention、overdue、finished day 等生产力状态切换伴侣视觉。
- 在 Clawd 菜单中显示当前任务和简洁的当日摘要。
- 从 Clawd 向 Super Productivity 发送受限的伴侣命令：
  open app、open current task、pause、resume、stop、complete、quick add。
- 所有任务变更仍由 Super Productivity 执行，Clawd 不复制任务业务逻辑。
- 两个桌面应用之间只使用本地通信。

## 仓库结构

```text
.
+-- clawd-on-desk/          # Clawd 桌面伴侣运行时
+-- super-productivity/     # 带伴侣桥接功能的 Super Productivity
`-- scripts/                # 跨项目验证和启动脚本
```

后续整合工作应该在这个仓库根目录内进行。不要继续在旧的外部 Clawd checkout 中做后续改动。

## 环境要求

- Windows 和 PowerShell
- Node.js 和 npm
- Git
- Chrome 或 Chromium，用于 Angular/Karma 测试
- 构建 Windows 组合安装包时需要 NSIS

在 PowerShell 中运行这个仓库里的 npm 命令时，建议使用 `npm.cmd`。

## 安装依赖

从仓库根目录开始：

```powershell
cd .\clawd-on-desk
npm.cmd ci

cd ..\super-productivity
npm.cmd ci
```

如果 Electron 原生包缺失或不完整，在对应项目目录下重新运行 `npm.cmd ci`。

## 验证整合

从仓库根目录运行完整的自动化整合验证：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-companion-integration.ps1
```

这个脚本会检查：

- Clawd productivity-state 桥接 smoke test
- Clawd 路由、菜单、命令客户端和状态测试
- Super Productivity Electron 主进程测试
- Super Productivity 伴侣命令、状态构建、发布器相关 specs
- Super Productivity Electron 构建

成功时会看到：

```text
Companion integration verification passed.
```

## 打包 Windows 组合 Release

GitHub release 优先通过根目录 workflow 自动构建：

```text
.github/workflows/release-windows-companion.yml
```

推送 `vX.Y.Z` tag 后，workflow 会：

1. 以 `SP_COMPANION_RELEASE=1` 构建 Super Productivity Windows 安装器。
2. 获取并验证 Clawd Windows sidecar binaries。
3. 构建 Clawd Windows 安装器。
4. 用 NSIS 生成 `Super-Productivity-Companion-Setup-x64.exe` 和
   `Super-Productivity-Companion-Setup-arm64.exe`。
5. 上传组合安装包、两个子应用原始安装器、`checksums.txt` 和 release notes。

也可以在本地已有两个子项目安装器后运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-windows-companion-release.ps1 -Version 0.1.0
```

本地脚本默认从以下目录读取构建产物：

```text
super-productivity\.tmp\app-builds
clawd-on-desk\dist
```

并输出到：

```text
release-artifacts
```

## 手动 GUI 验证

如果要进行可见的双应用手动测试，使用隔离启动脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-companion-gui-verification.ps1
```

脚本会启动：

- Super Productivity Angular 开发服务器
- 强制开启伴侣发布的 Super Productivity Electron 应用
- Clawd on Desk

脚本会使用系统临时目录下的隔离 session，因此不会影响你平时的 Super Productivity 或
Clawd 配置。启动后脚本会打印 checklist 文件路径。

常用选项：

```powershell
# 如果已经构建过 Electron，可以跳过重建
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-companion-gui-verification.ps1 -SkipElectronBuild

# 自动停止占用必要本地开发端口的进程
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-companion-gui-verification.ps1 -StopConflictingPorts
```

手动验证时：

1. 等待 Angular 开发服务器就绪。
2. 在临时 Super Productivity profile 中完成必要的首次启动设置。
3. 如果需要，启用 desktop companion integration 设置。
4. 在 Super Productivity 中创建并开始跟踪一个任务。
5. 确认 Clawd 切换到对应视觉状态。
6. 尝试 Clawd 的 Super Productivity 菜单命令。
7. 分别关闭其中一个应用，确认另一个应用可以安静失败，不出现明显错误。

## 开发命令

直接运行 Clawd：

```powershell
cd .\clawd-on-desk
npm.cmd start
```

运行 Super Productivity 桌面开发模式：

```powershell
cd .\super-productivity
npm.cmd run start
```

构建 Super Productivity Electron 文件：

```powershell
cd .\super-productivity
npm.cmd run electron:build
```

只运行 Clawd 的伴侣桥接 smoke test：

```powershell
cd .\clawd-on-desk
npm.cmd run verify:super-productivity-companion
```

## 桥接机制

Super Productivity 会构建一个小型生产力状态快照，并从 Electron 应用发布到 Clawd 的本地
endpoint：

```text
POST http://127.0.0.1:<clawd-port>/productivity-state
```

Clawd 会发现并保存这份状态。它会把生产力状态和旧的 agent session 状态分开存储，
然后把 productivity mode 映射到现有伴侣视觉状态。

命令流向相反方向，通过 Super Productivity 的本地桌面命令 endpoint：

```text
POST http://127.0.0.1:<super-productivity-port>/companion-command
```

这里仅暴露一组受限命令。Clawd 只发起动作请求；Super Productivity 决定如何修改任务和计时器。

## 当前状态

核心桥接和伴侣命令已经实现，并且有聚焦的自动化测试覆盖。后续 release 工作重点是
Windows 组合安装包的 CI 构建、干净 Windows 虚拟机安装验证，以及未签名安装体验说明。

详细项目计划见：

```text
super-productivity/docs/plans/2026-06-09-desktop-companion-integration.md
```
