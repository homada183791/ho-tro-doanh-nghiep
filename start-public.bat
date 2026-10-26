@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title LegalBiz AI - Public
cd /d "%~dp0"

rem ============================================================
rem  Khởi động LegalBiz AI và tạo đường link công khai
rem  (Cloudflare Tunnel miễn phí, không cần tài khoản)
rem ============================================================

set "PORT=3000"
set "TOOLS=%~dp0tools"
set "CF=%TOOLS%\cloudflared.exe"
set "LOG=%TOOLS%\tunnel.log"
set "PASSFILE=%TOOLS%\mat-khau.txt"
if not exist "%TOOLS%" mkdir "%TOOLS%"

echo.
echo  ==========================================
echo     LegalBiz AI - Khởi động và public web
echo  ==========================================
echo.

rem ---- 1. Kiểm tra Node.js ----
where node >nul 2>nul
if errorlevel 1 (
  echo  [LỖI] Máy chưa cài Node.js. Tải tại https://nodejs.org rồi chạy lại file này.
  pause
  exit /b 1
)

rem ---- 2. Cài thư viện lần đầu ----
set "CAN_CAI="
if not exist "node_modules" set "CAN_CAI=1"
rem Thư viện mới thêm (đọc PDF) chưa có thì cài bổ sung
if not exist "node_modules\pdfjs-dist" set "CAN_CAI=1"
if defined CAN_CAI (
  echo  [1/5] Cài thư viện lần đầu, mất vài phút...
  call npm install
  if errorlevel 1 (
    echo  [LỖI] npm install thất bại. Xem thông báo ở trên.
    pause
    exit /b 1
  )
) else (
  echo  [1/5] Thư viện đã có sẵn.
)

rem ---- 3. Chuẩn bị cloudflared ----
where cloudflared >nul 2>nul
if not errorlevel 1 (
  for /f "delims=" %%P in ('where cloudflared') do set "CF=%%P"
)
if not exist "%CF%" (
  echo  [2/5] Đang tải cloudflared lần đầu...
  curl -L --fail --progress-bar -o "%CF%" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
  if errorlevel 1 (
    echo  [LỖI] Không tải được cloudflared. Kiểm tra mạng, hoặc tự tải file
    echo        cloudflared-windows-amd64.exe từ github.com/cloudflare/cloudflared/releases
    echo        rồi đổi tên thành cloudflared.exe và đặt vào thư mục tools.
    if exist "%CF%" del "%CF%"
    pause
    exit /b 1
  )
) else (
  echo  [2/5] cloudflared đã có sẵn.
)

rem ---- 4. Mật khẩu truy cập ----
set "APP_PASSWORD="
if exist "%PASSFILE%" set /p APP_PASSWORD=<"%PASSFILE%"
if defined APP_PASSWORD (
  echo  [3/5] Dùng mật khẩu đã lưu trong tools\mat-khau.txt
  goto havepass
)
echo  [3/5] Đặt mật khẩu để người khác đăng nhập vào web.
echo        Không dùng dấu chấm than. Mật khẩu được lưu trong tools\mat-khau.txt
:askpass
set "APP_PASSWORD="
set /p "APP_PASSWORD=       Mật khẩu (ít nhất 6 ký tự): "
if not defined APP_PASSWORD goto askpass
set "_chk=!APP_PASSWORD:~5,1!"
if not defined _chk (
  echo        Mật khẩu quá ngắn.
  goto askpass
)
>"%PASSFILE%" echo !APP_PASSWORD!
:havepass

rem ---- 5. Khởi động máy chủ web ----
echo  [4/5] Khởi động máy chủ web ở cổng %PORT%...
start "LegalBiz Server" cmd /k "npm run dev -- --port %PORT% --strictPort"

set /a tries=0
:waitserver
set /a tries+=1
curl -s -o nul "http://localhost:%PORT%/"
if not errorlevel 1 goto serverup
if !tries! geq 90 (
  echo  [LỖI] Máy chủ không chạy được. Xem cửa sổ "LegalBiz Server".
  echo        Nếu báo cổng %PORT% đang bận, hãy tắt chương trình đang dùng cổng đó.
  pause
  goto stop
)
timeout /t 1 >nul
goto waitserver
:serverup

rem ---- 6. Mở đường hầm công khai ----
echo  [5/5] Đang tạo đường link công khai...
if exist "%LOG%" del "%LOG%"
start "LegalBiz Tunnel" /min cmd /c ""%CF%" tunnel --no-autoupdate --url http://localhost:%PORT% > "%LOG%" 2>&1"

set "URL="
set /a tries=0
:waiturl
set /a tries+=1
timeout /t 2 >nul
for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "$m = Select-String -Path '%LOG%' -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1; if ($m) { $m.Matches[0].Value }"`) do set "URL=%%U"
if defined URL goto goturl
if !tries! geq 45 (
  echo  [LỖI] Không tạo được đường link. Nội dung log:
  type "%LOG%"
  pause
  goto stop
)
goto waiturl
:goturl

echo %URL%| clip
echo.
echo  ==========================================================
echo   ĐÃ PUBLIC. Truy cập từ mọi nơi tại:
echo.
echo      %URL%
echo.
echo   - Đã chép link vào bộ nhớ tạm, dán Ctrl+V để gửi.
echo   - Mật khẩu đăng nhập: xem tools\mat-khau.txt
echo   - Trên máy này vẫn mở được http://localhost:%PORT% không cần mật khẩu.
echo   - Mỗi lần chạy lại file này, đường link sẽ đổi.
echo  ==========================================================
echo.
start "" "%URL%"
echo  Giữ cửa sổ này mở. Nhấn phím bất kỳ để TẮT web...
pause >nul

:stop
echo  Đang tắt...
taskkill /FI "WINDOWTITLE eq LegalBiz Tunnel*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Administrator:  LegalBiz Tunnel*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq LegalBiz Server*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq Administrator:  LegalBiz Server*" /T /F >nul 2>nul
endlocal
exit /b 0
