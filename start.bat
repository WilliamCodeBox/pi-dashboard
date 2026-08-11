@echo off
REM 一键启动 pi-dashboard（双击即可；窗口保留以便复制带 token 的 URL）
REM 需要 node 在 PATH 中（Node 22.6+ 需 --experimental-strip-types；23+ 可省略该 flag）
node --experimental-strip-types "%~dp0server.ts"
pause
