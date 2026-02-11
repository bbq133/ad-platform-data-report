#!/bin/bash
cd "$(dirname "$0")"
echo "正在启动开发服务，端口 5001..."
echo "启动后在浏览器打开: http://localhost:5001/"
npm run dev
