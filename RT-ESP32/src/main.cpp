#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>

#define ON_BOARD_LED 2

const char* ssid = "ArroyoArriba";
const char* password = "rutyjose8573";
const char* hostname = "rt-esp32";

WebServer server(80);

// Utility: add CORS headers to response
void addCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void handleHealth() {
  addCorsHeaders();
  DynamicJsonDocument doc(256);
  doc["ok"] = true;
  doc["ip"] = WiFi.localIP().toString();
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

void handleOptions() {
  addCorsHeaders();
  server.send(204, "text/plain", "");
}

void handlePin() {
  addCorsHeaders();
  if (server.method() == HTTP_OPTIONS) { // preflight
    server.send(204, "text/plain", "");
    return;
  }

  String body = server.arg("plain");
  DynamicJsonDocument doc(256);
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    DynamicJsonDocument r(128);
    r["ok"] = false;
    r["error"] = "Invalid JSON";
    String out; serializeJson(r, out);
    server.send(400, "application/json", out);
    return;
  }

  int pin = doc["pin"] | -1;
  const char* mode = doc["mode"] | "";
  int value = doc["value"] | 0;

  if (pin < 0 || pin > 40) {
    DynamicJsonDocument r(128);
    r["ok"] = false;
    r["error"] = "Invalid pin";
    String out; serializeJson(r, out);
    server.send(400, "application/json", out);
    return;
  }

  if (strcmp(mode, "OUTPUT") == 0) {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, value ? HIGH : LOW);
  } else if (strcmp(mode, "INPUT") == 0) {
    pinMode(pin, INPUT);
  } else if (strcmp(mode, "INPUT_PULLUP") == 0) {
    pinMode(pin, INPUT_PULLUP);
  } else {
    DynamicJsonDocument r(128);
    r["ok"] = false;
    r["error"] = "Invalid mode";
    String out; serializeJson(r, out);
    server.send(400, "application/json", out);
    return;
  }

  DynamicJsonDocument r(128);
  r["ok"] = true;
  r["pin"] = pin;
  r["mode"] = mode;
  r["value"] = value;
  String out; serializeJson(r, out);
  server.send(200, "application/json", out);
}

void setup() {
  Serial.begin(115200);
  WiFi.setHostname(hostname);
  WiFi.begin(ssid, password);
  pinMode(ON_BOARD_LED, OUTPUT);

  // Wait for connection
  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(ON_BOARD_LED, HIGH);
    delay(500);
    digitalWrite(ON_BOARD_LED, LOW);
    delay(500);
  }

  digitalWrite(ON_BOARD_LED, HIGH);

  if (MDNS.begin(hostname)) {
    Serial.printf("mDNS responder started: http://%s.local/\n", hostname);
  }

  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  // REST endpoints
  server.on("/health", HTTP_GET, handleHealth);
  server.on("/pin", HTTP_POST, handlePin);
  server.on("/pin", HTTP_OPTIONS, handleOptions);

  // Generic OPTIONS handler for preflight
  server.onNotFound([]() {
    if (server.method() == HTTP_OPTIONS) {
      addCorsHeaders();
      server.send(204, "text/plain", "");
    } else {
      addCorsHeaders();
      server.send(404, "application/json", "{\"ok\":false,\"error\":\"Not found\"}");
    }
  });

  server.begin();
}

void loop() {
  server.handleClient();
}
