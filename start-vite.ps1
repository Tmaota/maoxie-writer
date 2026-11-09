$node = "C:\Users\18435\AppData\Local\Programs\kimi-desktop\resources\resources\runtime\node"
$proj = "C:\Users\18435\Desktop\MAOXIEZUO\MAO\maoxie-writer"
$out = Join-Path $proj "vite-out.log"
$err = Join-Path $proj "vite-err.log"
$p = Start-Process -FilePath $node -ArgumentList "`"$proj\node_modules\vite\bin\vite.js`"","--port","5199","--strictPort","--host" -WorkingDirectory $proj -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden -PassThru
Set-Content -Path (Join-Path $proj "vite.pid") -Value $p.Id
Write-Output ("PID=" + $p.Id)
