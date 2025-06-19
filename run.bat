@ECHO OFF
TITLE Resource Management System Launcher

ECHO =================================================
ECHO  Galgame Resource Management System - Launcher
ECHO =================================================
ECHO.
ECHO This script will:
ECHO   1. Start the Python backend server (from the 'backend' folder)
ECHO   2. Open the HTML frontend (from the 'frontend' folder) in your browser
ECHO.
ECHO The 'run.bat' script should be in the PARENT directory
ECHO of 'backend' and 'frontend' (e.g., C:\ if your folders are C:\backend and C:\frontend).
ECHO.
ECHO Make sure 'python' is in your system's PATH.
ECHO The Python server will run in a SEPARATE window.
ECHO Please KEEP THE SERVER WINDOW OPEN for the application to work.
ECHO.

ECHO Starting backend server from '.\backend\app.py'...
REM The START command opens a new window for the Python server.
REM We specify the path to app.py relative to where run.bat is.
START "Python Backend Server" python backend\app.py

ECHO.
ECHO Waiting a few seconds for the server to initialize...
REM Timeout for 3 seconds. /NOBREAK means it won't be skipped by a key press.
REM > NUL hides the countdown output.
TIMEOUT /T 3 /NOBREAK > NUL

ECHO.
ECHO Opening frontend '.\frontend\index.html' in your default web browser...
REM This will open index.html from the frontend subfolder.
REM The browser should handle relative paths within index.html correctly
REM (e.g., script.js, style.css will be resolved relative to index.html's location).
START frontend\index.html

ECHO.
ECHO =================================================
ECHO  Launch process complete.
ECHO  - Backend server should be running in a new window.
ECHO  - Frontend should be open in your browser.
ECHO =================================================
ECHO.
REM You can uncomment the PAUSE below if you want this launcher window
REM to stay open until you press a key. Otherwise, it will close.
REM PAUSE
