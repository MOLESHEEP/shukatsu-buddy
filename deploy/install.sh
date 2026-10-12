#!/usr/bin/env bash
# 就活小助手 — one-shot installer for a fresh Ubuntu / Debian server.
#
#   curl -fsSL https://raw.githubusercontent.com/MOLESHEEP/shukatsu-buddy/main/deploy/install.sh | sudo bash
#
# What it does:
#   1. installs Docker (if missing)
#   2. adds a 2 GB swap file on small machines (< 2 GB RAM, no swap yet)
#   3. clones / updates the repo into /opt/shukatsu-buddy
#   4. creates .env on first run (random secrets; asks for admin account, domain and Cloudflare Tunnel token)
#   5. pulls the prebuilt image from GHCR and starts everything (no compiling on the server)
# Safe to re-run: it never overwrites an existing .env and keeps your database.
set -euo pipefail

DIR=/opt/shukatsu-buddy
REPO=https://github.com/MOLESHEEP/shukatsu-buddy.git
IMAGE=ghcr.io/molesheep/shukatsu-buddy:latest

if [ "$(id -u)" -ne 0 ]; then echo "请用 root 或 sudo 运行"; exit 1; fi
# When piped through curl, read answers from the terminal.
exec 3</dev/tty || exec 3<&0
ask() { local prompt="$1" var; read -r -u 3 -p "$prompt" var; echo "$var"; }
ask_secret() { local prompt="$1" var; read -r -s -u 3 -p "$prompt" var; echo >&2; echo "$var"; }

echo "==> 1/5 Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true
apt-get install -y -qq git openssl >/dev/null 2>&1 || true

echo "==> 2/5 内存 / swap"
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$mem_mb" -lt 2000 ] && [ "$(swapon --show | wc -l)" -eq 0 ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    内存 ${mem_mb}MB，已添加 2GB swap"
else
  echo "    内存 ${mem_mb}MB，跳过"
fi

echo "==> 3/5 代码"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone --depth 1 "$REPO" "$DIR"; fi
cd "$DIR"

echo "==> 4/5 配置"
if [ ! -f .env ]; then
  cp .env.example .env
  domain=$(ask "你的域名（例如 shukatsu.example.com）: ")
  admin_email=$(ask "管理员邮箱: ")
  admin_pw=$(ask_secret "管理员初始密码（至少 8 位，登录后请修改）: ")
  echo "Cloudflare Tunnel token：在 Cloudflare 面板 Zero Trust → Networks → Tunnels 创建隧道后复制（留空则不用隧道）"
  tunnel=$(ask_secret "TUNNEL_TOKEN: ")
  set_env() { # replace KEY=... (safe for any characters in the value)
    grep -v "^$1=" .env > .env.tmp || true
    printf '%s=%s\n' "$1" "$2" >> .env.tmp
    mv .env.tmp .env
  }
  set_env AUTH_SECRET "$(openssl rand -base64 32 | tr -d '\n/+=')"
  set_env POSTGRES_PASSWORD "$(openssl rand -hex 16)"
  set_env ADMIN_EMAILS "$admin_email"
  set_env ADMIN_PASSWORD "$admin_pw"
  set_env PUBLIC_URL "https://$domain"
  set_env DOMAIN "$domain"
  set_env APP_IMAGE "$IMAGE"
  if [ -n "$tunnel" ]; then
    set_env TUNNEL_TOKEN "$tunnel"
    set_env APP_BIND 127.0.0.1   # only reachable through the tunnel
  fi
  chmod 600 .env
  echo "    已生成 .env（随机密钥已写入）。AI 的 API Key 可以登录后在「管理后台 → AI 与额度」里填。"
else
  echo "    .env 已存在，保留原配置"
fi

echo "==> 5/5 启动"
profiles=()
grep -q '^TUNNEL_TOKEN=.\+' .env && profiles+=(--profile tunnel)
docker compose "${profiles[@]}" pull
docker compose "${profiles[@]}" up -d --no-build
sleep 5
docker compose ps
echo
echo "完成！"
grep -q '^TUNNEL_TOKEN=.\+' .env \
  && echo "打开 $(grep '^PUBLIC_URL=' .env | cut -d= -f2) （确认 Cloudflare 隧道的 Public Hostname 指向 http://app:3000）" \
  || echo "应用运行在 http://<服务器IP>:3000"
echo "更新到最新版：cd $DIR && git pull && docker compose ${profiles[*]} pull && docker compose ${profiles[*]} up -d --no-build"
