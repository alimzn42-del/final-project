#include <Arduino.h>
#include <Preferences.h>
#include "HX711.h"

const int HX711_DT_PIN  = 23;
const int HX711_SCK_PIN = 4;

const int SAMPLES_PER_READING     = 5;
const int SAMPLES_FOR_CALIBRATION = 30;
const unsigned long READ_INTERVAL_MS = 500;

const int   STABILITY_WINDOW      = 5;
const float STABILITY_THRESHOLD_G = 0.3;

const float ZERO_TRACK_MIN_G = 0.1;
const float ZERO_TRACK_MAX_G = 1.0;

const char* PREFS_NAMESPACE  = "scale";
const char* PREFS_KEY_FACTOR = "factor";

HX711 scale;
Preferences prefs;
float calibrationFactor = 0.0;
bool hx711Found = false;
unsigned long lastReadMs = 0;

float readings[STABILITY_WINDOW];
int readingsIndex = 0;
int readingsCount = 0;

void resetWindow() {
  readingsIndex = 0;
  readingsCount = 0;
}

void addToWindow(float value) {
  readings[readingsIndex] = value;
  readingsIndex = (readingsIndex + 1) % STABILITY_WINDOW;
  if (readingsCount < STABILITY_WINDOW) {
    readingsCount++;
  }
}

bool checkStability(float& mean, float& range) {
  float minValue = readings[0];
  float maxValue = readings[0];
  float sum = 0.0;

  for (int i = 0; i < readingsCount; i++) {
    if (readings[i] < minValue) minValue = readings[i];
    if (readings[i] > maxValue) maxValue = readings[i];
    sum += readings[i];
  }

  mean  = sum / readingsCount;
  range = maxValue - minValue;

  return readingsCount == STABILITY_WINDOW && range <= STABILITY_THRESHOLD_G;
}

bool applyZeroTracking(float mean, bool stable) {
  float absMean = fabs(mean);
  if (!stable || absMean < ZERO_TRACK_MIN_G || absMean > ZERO_TRACK_MAX_G) {
    return false;
  }

  long correction = (long)(mean * calibrationFactor);
  scale.set_offset(scale.get_offset() + correction);
  resetWindow();
  return true;
}

String waitForLine() {
  while (!Serial.available()) {
    delay(10);
  }
  String line = Serial.readStringUntil('\n');
  line.trim();
  return line;
}

void loadFactor() {
  prefs.begin(PREFS_NAMESPACE, true);
  calibrationFactor = prefs.getFloat(PREFS_KEY_FACTOR, 0.0);
  prefs.end();
}

void saveFactor(float factor) {
  prefs.begin(PREFS_NAMESPACE, false);
  prefs.putFloat(PREFS_KEY_FACTOR, factor);
  prefs.end();
}

void tareScale() {
  Serial.println("Taring... keep the plate empty.");
  scale.tare(SAMPLES_FOR_CALIBRATION);
  resetWindow();
  Serial.println("Tare done.");
}

void runCalibration() {
  Serial.println("=== Calibration ===");
  Serial.println("Step 1: Remove everything from the plate, then press Enter.");
  waitForLine();
  tareScale();

  Serial.println("Step 2: Place the known weight, wait 3 seconds,");
  Serial.println("        then type its weight in grams and press Enter.");
  float knownWeight = waitForLine().toFloat();

  if (knownWeight <= 0) {
    Serial.println("ERROR: invalid weight. Calibration cancelled.");
    return;
  }

  double net = scale.get_value(SAMPLES_FOR_CALIBRATION);
  float factor = net / knownWeight;

  if (fabs(factor) < 1.0) {
    Serial.println("ERROR: no weight detected. Calibration cancelled.");
    return;
  }

  calibrationFactor = factor;
  scale.set_scale(calibrationFactor);
  saveFactor(calibrationFactor);
  resetWindow();

  Serial.print("Calibration done. Factor = ");
  Serial.println(calibrationFactor, 3);
  Serial.println("Remove the weight.");
}

void handleCommand(const String& cmd) {
  if (cmd == "t") {
    tareScale();
  } else if (cmd == "c") {
    runCalibration();
  } else if (cmd.length() > 0) {
    Serial.println("Unknown command. Use: t = tare, c = calibrate");
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  scale.begin(HX711_DT_PIN, HX711_SCK_PIN);
  hx711Found = scale.wait_ready_timeout(3000);

  if (!hx711Found) {
    Serial.println("ERROR: HX711 not found. Check wiring, then reset.");
    return;
  }

  loadFactor();
  if (calibrationFactor == 0.0) {
    Serial.println("Scale not calibrated. Send 'c' to calibrate.");
  } else {
    scale.set_scale(calibrationFactor);
    Serial.print("Loaded factor = ");
    Serial.println(calibrationFactor, 3);
  }

  tareScale();
  Serial.println("Commands: t = tare, c = calibrate");
}

void loop() {
  if (!hx711Found) {
    return;
  }

  if (Serial.available()) {
    handleCommand(waitForLine());
  }

  if (millis() - lastReadMs >= READ_INTERVAL_MS) {
    lastReadMs = millis();

    if (calibrationFactor == 0.0) {
      Serial.print("net raw: ");
      Serial.println(scale.get_value(SAMPLES_PER_READING), 0);
      return;
    }

    addToWindow(scale.get_units(SAMPLES_PER_READING));

    float mean, range;
    bool stable = checkStability(mean, range);

    if (applyZeroTracking(mean, stable)) {
      Serial.print("Auto zero applied (drift was ");
      Serial.print(mean, 1);
      Serial.println(" g)");
      return;
    }

    Serial.print("weight: ");
    Serial.print(mean, 1);
    Serial.print(" g | range: ");
    Serial.print(range, 1);
    Serial.print(" g | ");
    Serial.println(stable ? "STABLE" : "UNSTABLE");
  }
}