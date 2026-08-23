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
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

BLEServer* pServer = NULL;
BLECharacteristic* pCharacteristic = NULL;
bool deviceConnected = false;

// Standard Heart Rate service and measurement characteristics
#define SERVICE_UUID        "0000180d"
#define CHARACTERISTIC_UUID "00002a37"

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
    };
    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      // Restart advertising so it can reconnect
      pServer->getAdvertising()->start();
    }
};

void setup() {
  Serial.begin(115200);

  // Initialize BLE Device
  BLEDevice::init("ESP32-Stroke-Monitor");

  // Create BLE GATT Server
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // Create Primary Service
  BLEService *pService = pServer->createService(SERVICE_UUID);

  // Create Characteristic
  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_READ   |
                      BLECharacteristic::PROPERTY_NOTIFY |
                      BLECharacteristic::PROPERTY_INDICATE
                    );

  // Add descriptor for notifications
  pCharacteristic->addDescriptor(new BLE2902());

  // Start service
  pService->start();

  // Start advertising
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);  // helper for iOS connection
  pAdvertising->setMinPreferred(0x12);
  pServer->getAdvertising()->start();
  
  Serial.println("ESP32 BLE Telemetry Server Active. Advertising...");
}

void loop() {
    if (deviceConnected) {
        // 1. Read your physical medical sensors here (e.g., heart rate and glucose level)
        int currentBPM = random(65, 95);     // Replace with physical sensor values
        int currentGlucose = random(80, 220); // Replace with physical sensor values
        
        // 2. Format vital readings as a clean JSON payload
        String jsonPayload = "{";
        jsonPayload += "\"age\":72,";
        jsonPayload += "\"heartRate\":" + String(currentBPM) + ",";
        jsonPayload += "\"avgGlucose\":" + String(currentGlucose) + ",";
        jsonPayload += "\"bmi\":31.2,";
        // 1 = Has hypertension history, 0 = No history
        jsonPayload += "\"hypertension\":" + String(random(0, 2)) + ","; 
        jsonPayload += "\"smokingStatus\":\"formerly\"";
        jsonPayload += "}";

        // 3. Send payload over the air to Stroke Risk Analyzer
        pCharacteristic->setValue(jsonPayload.c_str());
        pCharacteristic->notify();
        
        Serial.print("Broadcasted telemetry: ");
        Serial.println(jsonPayload);
        
        delay(3000); // Send data updates every 3 seconds
    }
}
```

### Tips for Customizing ESP32 Sensors:
1. **Heart Rate Vitals:** If using a pulse oximeter module (like MAX30102), replace `random(65, 95)` with your calculated beats-per-minute value.
2. **Vascular glucose levels:** Replace `random(80, 220)` with your blood glucose sensor output.
3. **UUID Customization:** If you want to use custom UUIDs instead of standard Heart Rate profiles, update them in the ESP32 code and corresponding fields in Stroke Risk Analyzer's **Settings** tab.
