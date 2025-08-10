import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me';
const HOTTOK = process.env.HOTMART_HOTTOK || '';
const ALLOWED_PRODUCTS = (process.env.ALLOWED_PRODUCT_IDS || '').split(',').map(s=>s.trim()).filter(Boolean);
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(bodyParser.json({limit:'1mb'}));
app.use(express.static(__dirname));

const DATA_DIR = path.join(__dirname, 'data');
const USERS = path.join(DATA_DIR, 'users.json');
if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if(!fs.existsSync(USERS)) fs.writeFileSync(USERS, JSON.stringify({}), 'utf8');

function loadUsers(){ try{ return JSON.parse(fs.readFileSync(USERS,'utf8')) }catch{ return {} } }
function saveUsers(d){ fs.writeFileSync(USERS, JSON.stringify(d, null, 2),'utf8'); }

app.get('/api/health', (req,res)=> res.json({ ok:true }));

// Webhook da Hotmart
app.post('/api/auth/hotmart/webhook', (req,res)=>{
  try{
    const token = req.headers['x-hotmart-hottok'];
    if(!token || token !== HOTTOK){
      return res.status(401).json({ error:'invalid hottok' });
    }
    const e = req.body || {};
    const purchaser = (e?.buyer?.email || e?.purchase?.buyer?.email || e?.data?.buyer?.email || '').toLowerCase();
    const status = (e?.purchase?.status || e?.data?.status || e?.status || '').toLowerCase();
    const productId = String(e?.product?.id || e?.data?.product?.id || e?.purchase?.product?.id || '');

    if(!purchaser){ return res.status(200).json({ ok:true, ignored:'no purchaser' }); }

    const users = loadUsers();
    if(status.includes('approved') || status.includes('completed') || status.includes('waiting_payment_approved')){
      if(ALLOWED_PRODUCTS.length && productId && !ALLOWED_PRODUCTS.includes(productId)){
        return res.status(200).json({ ok:true, ignored:'product not allowed' });
      }
      users[purchaser] = { email: purchaser, products: Array.from(new Set([...(users[purchaser]?.products || []), productId].filter(Boolean))) };
      saveUsers(users);
      return res.json({ ok:true, added:purchaser, productId });
    }else if(/(refunded|chargeback|canceled|cancelled|expired|overdue)/i.test(status)){
      delete users[purchaser];
      saveUsers(users);
      return res.json({ ok:true, removed:purchaser });
    }else{
      return res.json({ ok:true, received:true, status });
    }
  }catch(e){
    console.error('webhook error', e);
    res.status(500).json({ error:'internal' });
  }
});

// Solicitar link mágico
app.post('/api/auth/request-link', (req,res)=>{
  const { email, redirect='/' } = req.body || {};
  if(!email) return res.status(400).json({ error:'email required' });

  const users = loadUsers();
  const key = email.toLowerCase();
  const hasAccess = !!users[key];
  if(!hasAccess) return res.status(403).json({ error:'E-mail não encontrado. Use o e-mail da compra.' });

  const token = jwt.sign({ sub:key, email:key }, JWT_SECRET, { expiresIn:'2h' });
  const link = `${APP_BASE_URL}/api/auth/verify?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(redirect)}`;
  return res.json({ ok:true, link });
});

// Verificar token e salvar no localStorage (front)
app.get('/api/auth/verify', (req,res)=>{
  const { token, redirect='/' } = req.query;
  try{
    jwt.verify(String(token||''), JWT_SECRET);
  }catch(e){
    return res.status(401).send('<h1>Token inválido/expirado</h1>');
  }
  const html = `<!doctype html><meta charset="utf-8"><title>Entrando...</title>
<script>
  try{
    const token = ${JSON.stringify(String(req.query.token||''))};
    localStorage.setItem('md_token', token);
  }catch(e){}
  location.href = ${JSON.stringify(String(req.query.redirect||'/'))};
</script>`;
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(html);
});

// Rota protegida básica (perfil)
app.get('/api/auth/me', (req,res)=>{
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)/i);
  if(!m) return res.status(401).json({ error:'no token' });
  try{
    const data = jwt.verify(m[1], JWT_SECRET);
    return res.json({ email:data.email });
  }catch(e){
    return res.status(401).json({ error:'invalid token' });
  }
});

// Fallback para servir as páginas
app.get('*', (req,res,next)=>{
  if(req.path.startsWith('/api/')) return next();
  const file = req.path.endsWith('/login.html') ? 'login.html' : 'index.html';
  res.sendFile(path.join(__dirname, file));
});

app.listen(PORT, ()=> console.log('Server on http://localhost:' + PORT));
