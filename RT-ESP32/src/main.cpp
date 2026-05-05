#include <Arduino.h>
#include <WiFi.h>
#include <ESPmDNS.h>

#define ON_BOARD_LED 2

const char* ssid = "ArroyoArriba";
const char* password = "rutyjose8573";
const char* hostname = "rt-esp32";

WiFiServer server(80); //port 80 for HTTP

void setup() {
  Serial.begin(115200);
  WiFi.setHostname(hostname);
  WiFi.begin(ssid,password);
  pinMode(ON_BOARD_LED, OUTPUT);

  while (WiFi.status() != WL_CONNECTED)
  {
    digitalWrite(ON_BOARD_LED, HIGH);
    delay(500);
    digitalWrite(ON_BOARD_LED, LOW);
    delay(500);
  }

  digitalWrite(ON_BOARD_LED, HIGH);
  server.begin();

  if (MDNS.begin(hostname)) {
    Serial.printf("mDNS responder started: http://%s.local/\n", hostname);
  }

  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

}

void loop() {
  WiFiClient client = server.available();
  if (client) {
    String currentLine = "";
    while (client.connected()) {
      if (client.available()) {
        char c = client.read();
        Serial.write(c);
        if (c == '\n') {
          if (currentLine.length() == 0) {
            client.println("HTTP/1.1 200 OK");
            client.println("Content-type:text/html");
            client.println();
            client.println("<!DOCTYPE HTML><html><body><h1>Hello from ESP32</h1></body></html>");
            break;
          } else {
            currentLine = "";
          }
        } else if (c != '\r') {
          currentLine += c;
        }
      }
    }
    client.stop();
    Serial.println("Client Disconnected.");
  }
}
