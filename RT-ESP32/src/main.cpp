#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>
#include <map>

#define ON_BOARD_LED 2

const char* ssid     = "Arroyo";
const char* password = "rutyjose8573";
const char* hostname = "rt-esp32";

WebServer server(80);

// --- Program state ---
DynamicJsonDocument programDoc(4096);
bool programLoaded = false;
std::map<String, int> vars;

// -------------------------------------------------------
// CORS
// -------------------------------------------------------
void addCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

// -------------------------------------------------------
// resolveInt: parses "123" as 123, or looks up a variable name.
// This is how block params like {value: "brightness"} work at runtime.
// -------------------------------------------------------
int resolveInt(const char* s, int fallback = 0) {
  if (!s || *s == '\0') return fallback;
  char* end;
  long v = strtol(s, &end, 10);
  if (end != s) return (int)v;
  auto it = vars.find(String(s));
  return (it != vars.end()) ? it->second : fallback;
}

// -------------------------------------------------------
// Block interpreter
// -------------------------------------------------------
void executeInstruction(JsonObject instr);

void executeChildren(JsonObject instr) {
  JsonArray children = instr["children"].as<JsonArray>();
  if (children.isNull()) return;
  for (JsonObject child : children) executeInstruction(child);
}

void executeInstruction(JsonObject instr) {
  const char* type = instr["type"] | "";
  JsonObject  p    = instr["params"].as<JsonObject>();

  if (strcmp(type, "serialBegin") == 0) {
    Serial.begin(resolveInt(p["baud"] | "115200"));

  } else if (strcmp(type, "pinMode") == 0) {
    int pin = resolveInt(p["pin"] | "0");
    const char* mode = p["mode"] | "OUTPUT";
    if      (strcmp(mode, "INPUT")        == 0) pinMode(pin, INPUT);
    else if (strcmp(mode, "INPUT_PULLUP") == 0) pinMode(pin, INPUT_PULLUP);
    else                                        pinMode(pin, OUTPUT);

  } else if (strcmp(type, "digitalHigh") == 0) {
    digitalWrite(resolveInt(p["pin"] | "0"), HIGH);

  } else if (strcmp(type, "digitalLow") == 0) {
    digitalWrite(resolveInt(p["pin"] | "0"), LOW);

  } else if (strcmp(type, "digitalRead") == 0) {
    vars[String(p["var"] | "")] = digitalRead(resolveInt(p["pin"] | "0"));

  } else if (strcmp(type, "analogRead") == 0) {
    vars[String(p["var"] | "")] = analogRead(resolveInt(p["pin"] | "0"));

  } else if (strcmp(type, "analogWrite") == 0) {
    analogWrite(resolveInt(p["pin"] | "0"), resolveInt(p["value"] | "0"));

  } else if (strcmp(type, "mapValue") == 0) {
    int srcVal = resolveInt(p["src"] | "0");
    int result = (int)map((long)srcVal,
                          (long)resolveInt(p["fromLow"]  | "0"),
                          (long)resolveInt(p["fromHigh"] | "4095"),
                          (long)resolveInt(p["toLow"]    | "0"),
                          (long)resolveInt(p["toHigh"]   | "255"));
    vars[String(p["dst"] | "")] = result;

  } else if (strcmp(type, "serialPrint") == 0) {
    const char* text = p["text"] | "";
    const char* tipo = p["tipo"] | "texto";
    if (strcmp(tipo, "variable") == 0) {
      auto it = vars.find(String(text));
      if (it != vars.end()) Serial.println(it->second);
    } else {
      Serial.println(text);
    }

  } else if (strcmp(type, "delay") == 0) {
    delay((unsigned long)resolveInt(p["ms"] | "0"));

  } else if (strcmp(type, "for") == 0) {
    String varName = String(p["var"] | "i");
    int count = resolveInt(p["count"] | "0");
    for (int i = 0; i < count; i++) {
      vars[varName] = i;
      executeChildren(instr);
    }
  }
}

void runSection(const char* section) {
  JsonArray arr = programDoc["blocks"][section].as<JsonArray>();
  if (arr.isNull()) return;
  for (JsonObject instr : arr) executeInstruction(instr);
}

// -------------------------------------------------------
// HTTP handlers
// -------------------------------------------------------
void handleOptions() {
  addCorsHeaders();
  server.send(204, "text/plain", "");
}

void handleHealth() {
  addCorsHeaders();
  DynamicJsonDocument doc(256);
  doc["ok"]            = true;
  doc["ip"]            = WiFi.localIP().toString();
  doc["programLoaded"] = programLoaded;
  String out; serializeJson(doc, out);
  server.send(200, "application/json", out);
}

void handlePin() {
  addCorsHeaders();
  if (server.method() == HTTP_OPTIONS) { server.send(204); return; }

  DynamicJsonDocument doc(256);
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"Invalid JSON\"}");
    return;
  }

  int pin         = doc["pin"]   | -1;
  const char* mode = doc["mode"] | "";
  int value        = doc["value"] | 0;

  if (pin < 0 || pin > 40) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"Invalid pin\"}");
    return;
  }

  if      (strcmp(mode, "OUTPUT")       == 0) { pinMode(pin, OUTPUT); digitalWrite(pin, value ? HIGH : LOW); }
  else if (strcmp(mode, "INPUT")        == 0) { pinMode(pin, INPUT); }
  else if (strcmp(mode, "INPUT_PULLUP") == 0) { pinMode(pin, INPUT_PULLUP); }
  else { server.send(400, "application/json", "{\"ok\":false,\"error\":\"Invalid mode\"}"); return; }

  DynamicJsonDocument r(128);
  r["ok"] = true; r["pin"] = pin; r["mode"] = mode; r["value"] = value;
  String out; serializeJson(r, out);
  server.send(200, "application/json", out);
}

void handleProgram() {
  addCorsHeaders();
  if (server.method() == HTTP_OPTIONS) { server.send(204); return; }

  // Only parse the "blocks" subtree — the "code" string can be large and we don't need it.
  StaticJsonDocument<16> filter;
  filter["blocks"] = true;

  programDoc.clear();
  DeserializationError err = deserializeJson(
    programDoc, server.arg("plain"), DeserializationOption::Filter(filter)
  );

  if (err) {
    String msg = String("{\"ok\":false,\"error\":\"JSON: ") + err.c_str() + "\"}";
    server.send(400, "application/json", msg);
    return;
  }
  if (programDoc["blocks"].isNull()) {
    server.send(400, "application/json", "{\"ok\":false,\"error\":\"Missing blocks\"}");
    return;
  }

  programLoaded = false;
  vars.clear();
  runSection("setup");
  programLoaded = true;

  server.send(200, "application/json", "{\"ok\":true,\"message\":\"Program loaded and running\"}");
}

void handleStop() {
  addCorsHeaders();
  programLoaded = false;
  vars.clear();
  server.send(200, "application/json", "{\"ok\":true,\"message\":\"Program stopped\"}");
}

// -------------------------------------------------------
// Arduino entry points
// -------------------------------------------------------
void setup() {
  Serial.begin(115200);
  WiFi.setHostname(hostname);
  WiFi.begin(ssid, password);
  pinMode(ON_BOARD_LED, OUTPUT);

  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(ON_BOARD_LED, HIGH); delay(250);
    digitalWrite(ON_BOARD_LED, LOW);  delay(250);
  }
  digitalWrite(ON_BOARD_LED, HIGH);

  if (MDNS.begin(hostname))
    Serial.printf("mDNS: http://%s.local/\n", hostname);
  Serial.printf("IP: %s\n", WiFi.localIP().toString().c_str());

  server.on("/health",  HTTP_GET,     handleHealth);
  server.on("/pin",     HTTP_POST,    handlePin);
  server.on("/pin",     HTTP_OPTIONS, handleOptions);
  server.on("/program", HTTP_POST,    handleProgram);
  server.on("/program", HTTP_OPTIONS, handleOptions);
  server.on("/stop",    HTTP_POST,    handleStop);
  server.on("/stop",    HTTP_OPTIONS, handleOptions);

  server.onNotFound([]() {
    addCorsHeaders();
    if (server.method() == HTTP_OPTIONS) server.send(204);
    else server.send(404, "application/json", "{\"ok\":false,\"error\":\"Not found\"}");
  });

  server.begin();
}

void loop() {
  server.handleClient();
  if (programLoaded) runSection("loop");
}
