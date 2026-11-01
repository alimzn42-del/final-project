# PLC

PLC programs and project files. The PLC model is not chosen yet, so nothing here depends on one vendor's tool.

The PLC runs sequencing and safety. It owns all limits, alarms and interlocks: the web app only shows what
the PLC reports. How alarms reach the web app is still an open item in
[`web-app/docs/05-roadmap.md`](../web-app/docs/05-roadmap.md).

Git stores every file in this folder exactly as the PLC software wrote it (see `.gitattributes`), so line
endings are never changed.

If the PLC software can export the program as text, commit the export next to the project file. Project files
are often binary, so Git cannot show what changed in them. A text export makes each change reviewable.
