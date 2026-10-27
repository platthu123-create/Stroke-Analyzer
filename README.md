# Stroke Risk Analyzer - Clinical Suite

Stroke Risk Analyzer is a lightweight, responsive medical decision support web application. It connects directly to ESP32 microcontrollers over Bluetooth Low Energy (BLE) to extract live patient vital data and uses a local Node.js backend to securely call the Google Gemini API.

Designed with a clean, medical-themed clinical aesthetic (Teal & Mint), it runs locally with patient data stored in the browser and the Gemini credential kept in the backend environment.

---

## Features
- **Clinic Dashboard:** Track recent evaluations and total high-risk patient indicators.
- **ESP32 BLE Sync:** Pair wirelessly with your ESP32 device, stream live vitals, and auto-populate clinical forms.
- **AI Stroke Risk Assessment:** Leverages Gemini (1.5 Flash or 1.5 Pro) to analyze risk levels, list contributing factors, and supply recommendations.
- **AI Medical Assistant:** A conversational assistant for general clinical queries or follow-up questions.
- **Local Sandbox Storage:** Saves patient records, Bluetooth preferences, and API credentials securely in the browser's `localStorage`.
- **Export Controls:** Print reports directly to PDF or download structured CSV logs.

---

## 1. Quick Start (Running Locally)
1. Install Node.js 18 or newer.
2. Run `npm install` in the project folder.
3. Copy `.env.example` to `.env` and set `GEMINI_API_KEY`.
4. Run `npm start` and open `http://localhost:3000`.

*Note: The Web Bluetooth API requires either a local host connection (`localhost`) or an HTTPS connection to function due to browser security guidelines. The backend must run alongside the frontend for AI features.*

## 3. Programming your ESP32 (C++ Bluetooth BLE Server)
To send data to the application from your ESP32, upload this C++ code using the Arduino IDE. It initializes a BLE server advertising as `ESP32-Stroke-Monitor` and broadcasts patient vitals in a JSON structure.

```cpp
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>

#include "MAX30105.h"
#include "spo2_algorithm.h"

#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <math.h>

const char* ssid = "YourWifiName";
const char* password = "YourWifiPassword";
const char* serverUrl = "your-server-address";

MAX30105 particleSensor;
Adafruit_MPU6050 mpu;

#define I2C_SDA 8
#define I2C_SCL 9

#define BUFFER_SIZE 100

uint32_t irBuffer[BUFFER_SIZE];
uint32_t redBuffer[BUFFER_SIZE];

int32_t spo2 = 0;
int8_t validSPO2 = 0;

int32_t heartRate = 0;
int8_t validHeartRate = 0;

#define CALIBRATION_TIME 3000

float accOffsetX = 0;
float accOffsetY = 0;
float accOffsetZ = 0;

float gyroOffsetX = 0;
float gyroOffsetY = 0;
float gyroOffsetZ = 0;

float magnitude(float x, float y, float z) {
  return sqrt(x * x + y * y + z * z);
}

void calibrateMPU() {
  Serial.println();
  Serial.println("================================");
  Serial.println("       MPU6050 CALIBRATION");
  Serial.println("================================");
  Serial.println("GIU CAM BIEN NAM YEN TREN BAN TRONG 3 GIAY.");
  delay(1000);

  float sumAx = 0, sumAy = 0, sumAz = 0;
  float sumGx = 0, sumGy = 0, sumGz = 0;
  int samples = 0;

  unsigned long startTime = millis();

  while (millis() - startTime < CALIBRATION_TIME) {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    sumAx += a.acceleration.x;
    sumAy += a.acceleration.y;
    sumAz += a.acceleration.z;

    sumGx += g.gyro.x;
    sumGy += g.gyro.y;
    sumGz += g.gyro.z;

    samples++;
    delay(5);
  }

  accOffsetX = sumAx / samples;
  accOffsetY = sumAy / samples;
  accOffsetZ = (sumAz / samples) - 9.80665;

  gyroOffsetX = sumGx / samples;
  gyroOffsetY = sumGy / samples;
  gyroOffsetZ = sumGz / samples;

  Serial.println("Calibration MPU6050 hoàn tất!");
}

// =====================================================
// SETUP
// =====================================================

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println();
  Serial.println("==============================================");
  Serial.println("       ESP32-S3-ZERO SENSOR SYSTEM");
  Serial.println("==============================================");

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);

  int wifiCounter = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    wifiCounter++;
    if (wifiCounter > 40) {
      Serial.println("\nWiFi Timeout! Tiếp tục chạy offline...");
      break;
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  }

  Wire.begin(I2C_SDA, I2C_SCL);

  Serial.println("Initializing MAX30102...");
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("ERROR: MAX30102 NOT FOUND!");
    while (1) { delay(1000); }
  }
  Serial.println("MAX30102 detected!");

  byte ledBrightness = 40;
  byte sampleAverage = 4;
  byte ledMode = 2;
  byte sampleRate = 100;
  int pulseWidth = 411;
  int adcRange = 4096;

  particleSensor.setup(ledBrightness, sampleAverage, ledMode, sampleRate, pulseWidth, adcRange);
  particleSensor.setPulseAmplitudeGreen(0);

  Serial.println("Initializing MPU6050...");
  if (!mpu.begin(0x68, &Wire)) {
    Serial.println("ERROR: MPU6050 NOT FOUND!");
    while (1) { delay(1000); }
  }
  Serial.println("MPU6050 detected!");

  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  delay(500);

  calibrateMPU();

  Serial.println("==============================================");
  Serial.println("        SYSTEM READY & RUNNING!");
  Serial.println("==============================================");
}

// =====================================================
// LOOP
// =====================================================

void loop() {
  Serial.println("\n==============================================");
  Serial.println("       COLLECTING SENSOR DATA...");
  Serial.println("==============================================");

  for (int i = 0; i < BUFFER_SIZE; i++) {
    while (particleSensor.available() == false) {
      particleSensor.check();
    }

    redBuffer[i] = particleSensor.getRed();
    irBuffer[i] = particleSensor.getIR();
    particleSensor.nextSample();

    delay(5);
  }

  uint32_t irValue = irBuffer[BUFFER_SIZE - 1];
  Serial.print("IR = ");
  Serial.println(irValue);

  if (irValue < 50000) {
    Serial.println("MAX30102: NO FINGER DETECTED. Dat ngon tay len cam bien.");
    delay(1000);
    return;
  }

  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, BUFFER_SIZE, redBuffer,
    &spo2, &validSPO2, &heartRate, &validHeartRate
  );

  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  float ax = a.acceleration.x - accOffsetX;
  float ay = a.acceleration.y - accOffsetY;
  float az = a.acceleration.z - accOffsetZ;
  float totalAcc = magnitude(ax, ay, az);

  Serial.println("----------------------------------------------");
  if (validHeartRate && heartRate > 30 && heartRate < 220) {
    Serial.print("Heart Rate : "); Serial.print(heartRate); Serial.println(" BPM");
  } else {
    Serial.println("Heart Rate : Invalid");
  }

  if (validSPO2 && spo2 >= 70 && spo2 <= 100) {
    Serial.print("SpO2       : "); Serial.print(spo2); Serial.println(" %");
  } else {
    Serial.println("SpO2       : Invalid");
  }

  Serial.print("Acceleration: "); Serial.print(totalAcc, 2); Serial.println(" m/s^2");
  Serial.println("----------------------------------------------");

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    String hrVal = (validHeartRate && heartRate > 30 && heartRate < 220) ? String(heartRate) : "0";
    String spo2Val = (validSPO2 && spo2 >= 70 && spo2 <= 100) ? String(spo2) : "0";

    String httpRequestData = "{\"heartRate\": " + hrVal + 
                             ", \"spo2\": " + spo2Val + 
                             ", \"acceleration\": " + String(totalAcc, 2) + "}";

    int httpResponseCode = http.POST(httpRequestData);
    
    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);
    
    http.end();
  } else {
    Serial.println("WiFi Disconnected. Không thể gửi dữ liệu.");
  }

  delay(2000); 
}
```

### Tips for Customizing ESP32 Sensors:
1. **Heart Rate Vitals:** If using a pulse oximeter module (like MAX30102), replace `random(65, 95)` with your calculated beats-per-minute value.
3. **UUID Customization:** If you want to use custom UUIDs instead of standard Heart Rate profiles, update them in the ESP32 code and corresponding fields in Stroke Risk Analyzer's **Settings** tab.
