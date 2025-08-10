# Mente de Dono — Portal Protegido (Render + Hotmart)
- Proteção Hotmart por Webhook + JWT
- Login por link mágico (demo)
- Portal completo responsivo com apostila e certificado
- Variáveis em `.env` (edite APP_BASE_URL após deploy)

Deploy no Render:
1) Suba os arquivos para um repo
2) New Web Service → Node 18+ → Build `npm install` → Start `npm start`
3) Cadastre env: PORT, HOTMART_HOTTOK, JWT_SECRET, ALLOWED_PRODUCT_IDS, APP_BASE_URL
4) (Opcional) Disk em `/opt/render/project/src/data`
5) Webhook Hotmart → `/api/auth/hotmart/webhook`
6) Área de membros: link para `/login.html`
