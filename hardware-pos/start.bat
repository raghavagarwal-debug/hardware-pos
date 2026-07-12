@echo off
echo ===================================================
echo   ShopSphere - Price ^& Stock Ledger Startup
echo ===================================================
echo.
echo Installing backend dependencies...
cd backend
call npm install
cd ..
echo.
echo Installing frontend dependencies (with legacy-peer-deps)...
cd frontend
call npm install --legacy-peer-deps
cd ..
echo.
echo Starting Backend Server on http://localhost:4000...
start cmd /k "cd backend && npm start"
echo.
echo Starting Frontend Server on http://localhost:5173...
start cmd /k "cd frontend && npm run dev"
echo.
echo Done! Both servers should now be running.
echo Please visit http://localhost:5173 to use the application.
echo.
pause
