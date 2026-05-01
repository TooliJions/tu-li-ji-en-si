@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo    CyberNovelist v7.0 一键启动
echo ============================================
echo.

:: 环境检查
where pnpm >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 pnpm，请先安装: npm install -g pnpm
    pause
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js ^>= 20.0.0
    pause
    exit /b 1
)

:: 可选验证
echo.
choice /c VN /n /t 5 /d N /m "按 V 先运行验证，5 秒后默认直接启动 [V/N]: "
if errorlevel 255 goto skip_verify
if %errorlevel% == 1 (
    echo.
    echo [验证] 运行 pnpm verify...
    call pnpm verify
    if errorlevel 1 (
        echo.
        echo [警告] 验证未通过，请修复后重试
        pause
        exit /b 1
    )
    echo [验证] 通过，继续启动...
)
:skip_verify

:: 依赖检查
echo.
echo [1/4] 检查项目依赖...
if not exist "node_modules" (
    echo   未检测到 node_modules，正在执行 pnpm install...
    call pnpm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
) else (
    echo   依赖已安装，跳过
)

:: 构建
echo [2/4] 构建 API 与 core 包...
call pnpm --filter @cybernovelist/studio build:api
if errorlevel 1 (
    echo [错误] 构建失败
    pause
    exit /b 1
)

:: 端口冲突自动释放
echo [3/4] 检查端口占用...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo   端口 3000 被 PID=%%a 占用，正在释放...
    taskkill /F /PID %%a >nul 2>nul
    timeout /t 1 /nobreak >nul
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
    echo   端口 5173 被 PID=%%a 占用，正在释放...
    taskkill /F /PID %%a >nul 2>nul
    timeout /t 1 /nobreak >nul
)

echo   端口检查完毕

:: 启动服务
echo [4/4] 启动开发服务器...
echo.

cd packages\studio

echo   正在启动 API 服务，端口 3000...
start "CyberNovelist API" cmd /k "pnpm dev:api"

echo   等待 API 初始化...
timeout /t 3 /nobreak >nul
echo   API 已就绪

echo   正在启动前端服务，端口 5173...
start "CyberNovelist Web" cmd /k "pnpm exec vite"

echo.
echo ============================================
echo  服务已启动：
echo    API: http://localhost:3000
echo    Web: http://localhost:5173
echo ============================================
echo.
echo 提示：关闭 API 或 Web 窗口即可停止对应服务。
echo.

cd ..\..
pause

