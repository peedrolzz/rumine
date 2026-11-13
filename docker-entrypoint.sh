#!/bin/sh
# Prepara a pasta das declarações (no volume do Fly, que nasce como root) e roda o comando
# como o usuário "node", sem privilégios.
set -e
mkdir -p "${ARMAZENAMENTO_DIR:-/data/declaracoes}"
chown -R node:node /data
exec runuser -u node -- "$@"
