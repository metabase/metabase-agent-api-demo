#!/bin/sh
set -e
LISTEN_PORT="${LISTEN_PORT:-4010}"
API_PORT="${API_PORT:-4011}"
sed -i \
  -e "s/__LISTEN_PORT__/${LISTEN_PORT}/g" \
  -e "s/__API_PORT__/${API_PORT}/g" \
  /etc/nginx/conf.d/default.conf
