#include <Arduino.h>

void setup() {
  pinMode(32, OUTPUT);
  pinMode(35, INPUT);
}

void loop() {
  delay(500);
  digitalWrite(32, HIGH);
  delay(500);
  digitalWrite(32, LOW);
}