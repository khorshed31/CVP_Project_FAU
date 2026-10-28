@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Creating virtual environment...
  py -m venv .venv
  if errorlevel 1 goto error
  call ".venv\Scripts\activate.bat"
  python -m pip install --upgrade pip
  if errorlevel 1 goto error
  pip install -r requirements.txt
  if errorlevel 1 goto error
) else (
  call ".venv\Scripts\activate.bat"
)
echo Starting CompVP Mooney Studio...
echo Open http://127.0.0.1:5000 in your browser.
python app.py
goto end
:error
echo Setup failed. Please read README.md for manual installation steps.
pause
:end
endlocal
