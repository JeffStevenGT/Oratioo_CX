@echo off
REM Limpieza diaria de logs del bot Oratioo CX
del /q "C:\Users\Jeff\Desktop\Proyectos\Oratioo_CX\bot\logs\*.log" 2>nul
echo [%date% %time%] Logs limpiados
