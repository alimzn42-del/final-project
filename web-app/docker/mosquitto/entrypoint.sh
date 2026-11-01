#!/bin/sh
# Builds Mosquitto's password file from MQTT_USERNAME / MQTT_PASSWORD on every
# start, so the password lives only in .env, never in the repo or an image.
set -eu

: "${MQTT_USERNAME:?MQTT_USERNAME is not set}"
: "${MQTT_PASSWORD:?MQTT_PASSWORD is not set}"

mkdir -p /mosquitto/auth
mosquitto_passwd -c -b /mosquitto/auth/passwd "$MQTT_USERNAME" "$MQTT_PASSWORD"
chmod 0700 /mosquitto/auth
chmod 0600 /mosquitto/auth/passwd

# The image's entrypoint gives /mosquitto to the mosquitto user, then the
# broker drops root privileges.
exec /docker-entrypoint.sh mosquitto -c /etc/mixline/mosquitto.conf
