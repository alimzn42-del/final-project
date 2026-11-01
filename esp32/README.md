# ESP32

ESP32 firmware: load cells (HX711) and fast loops.

**Passwords:** keep Wi-Fi and MQTT passwords in a file named `secrets.h`. Git ignores that name in this folder.
Commit a `secrets.example.h` with the same names and empty values, so others can see what to fill in.

**Build output:** `.pio/` and `build/` are ignored too, so only your source code is committed.

**Talking to the web app:** anything published over MQTT must match
[`web-app/docs/04-architecture.md`](../web-app/docs/04-architecture.md) (section "MQTT"), with sensor names from
[`web-app/config/machine.json`](../web-app/config/machine.json). The simulator publishes those same messages
today, so real hardware can replace it without any change to the web app. Use `"source": "hw"` in each message.

**Time:** the ESP32 has no battery-backed clock, so its timestamps can be wrong. See "Time" in
[`web-app/docs/01-overview.md`](../web-app/docs/01-overview.md).
