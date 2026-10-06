#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js가 설치되어 있지 않습니다. 설치 페이지를 엽니다."
  open https://nodejs.org
  read -n 1 -p "설치 후 다시 실행하세요. 아무 키나 누르면 닫힙니다."
  exit 1
fi
node start.js
