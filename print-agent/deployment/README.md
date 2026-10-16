# Bakery POS print agent deployment

Build on Windows x64 with Node.js 24 and run `npm ci`, `npm test`, `npm run build:windows`, and `npm run test:windows` from `print-agent`. The versioned folder under `release/` is the distributable. Each release is named from `package.json` version; increase that version before a new release. Keep the previous release available for rollback.

Copy the release folder to each POS workstation, for example `C:\BakeryPOS`. The folder contains `ProsincPrintAgent.exe`, `windows-raw-print.ps1`, `agent-config.example.json`, `install-task.ps1`, and `VERSION.txt`. Copy the per-workstation configuration downloaded from POS Printer Settings to `agent-config.json` in that folder. Do not distribute one workstation's token to another. The config, state, and log files are external to the executable. Relative `statePath` and `logPath` values resolve beside the config file; the default paths are `agent-config.json.state.json` and `agent.log`.

From PowerShell on the workstation, run `./ProsincPrintAgent.exe --self-test` to check embedded receipt rendering and the Windows print helper. Then run `./install-task.ps1` under the cashier or service account that can access the printer queue. Start the task with `Start-ScheduledTask -TaskName 'Bakery POS Print Agent'`. For a network printer, confirm the workstation can reach its private IP and raw TCP port. For a Windows queue, install the driver and grant the task account print access. Use the POS admin **Test print** button and inspect the physical output.

The agent polls only jobs assigned to its profile. A `PRINTED` status confirms transport or spooler acceptance, not that paper emerged. Inspect paper before retrying a failed job. To update, stop the scheduled task, replace only the executable and bundled helper, keep the same external config/state files, then restart the task. Rotate a token in POS administration if its config was exposed.

For development, `node agent.mjs agent-config.json` remains supported and runs the same logic. The optional `testOutputDir` writes ESC/POS bytes to files for diagnostics and should be omitted on production workstations.
