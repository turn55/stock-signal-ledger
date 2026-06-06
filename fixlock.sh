C:\projects\stock-signal-ledger\package-lock.json is stale and causing Railway deploy to fail.
To fix this, delete package-lock.json entirely and push everything.

In PowerShell:

Remove-Item C:\projects\stock-signal-ledger\package-lock.json -Force
cd C:\projects\stock-signal-ledger
git add -A
git commit -m "Delete stale package-lock.json"
git push
