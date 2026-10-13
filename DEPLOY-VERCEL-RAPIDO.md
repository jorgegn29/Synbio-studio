# ⚡ Deploy a Vercel en 2 Minutos

Vercel es **MÁS RÁPIDO** que GitHub Pages y ofrece:
- ✅ Deploy en <60 segundos
- ✅ HTTPS automático
- ✅ Analytics gratis
- ✅ URL profesional: `synbio-llvm.vercel.app`
- ✅ Preview automático de cada commit

---

## 🚀 Opción 1: Deploy desde CLI (RECOMENDADO)

### Paso 1: Instalar Vercel CLI
```powershell
npm install -g vercel
```

### Paso 2: Login
```powershell
vercel login
# → Te abrirá el navegador
# → Login con GitHub (recomendado)
# → Verifica el email
```

### Paso 3: Deploy
```powershell
cd C:\Users\Usuario\Desktop\SynBio-LLVM-Proyecto\web-demo

# Primer deploy (configuración interactiva)
vercel

# Respuestas:
# Set up and deploy? → Y
# Which scope? → tu_usuario
# Link to existing project? → N
# What's your project name? → synbio-llvm
# In which directory is your code? → ./
# Override settings? → N

# ✅ Deploy completo!
# URL preview: https://synbio-llvm-xxx.vercel.app
```

### Paso 4: Deploy a producción
```powershell
vercel --prod

# ✅ URL final: https://synbio-llvm.vercel.app
```

---

## 🌐 Opción 2: Deploy desde dashboard (SIN CLI)

### Paso 1: Crear cuenta
1. Ir a https://vercel.com/signup
2. **Sign up with GitHub** (lo más fácil)
3. Autorizar Vercel

### Paso 2: Import repository
1. Click "Add New Project"
2. Import Git Repository → Buscar `synbio-llvm`
3. Click "Import"

### Paso 3: Configurar proyecto
```
Framework Preset: Next.js
Root Directory: web-demo  ← IMPORTANTE
Build Command: (auto-detectado)
Output Directory: out  ← IMPORTANTE
Install Command: npm install
```

### Paso 4: Deploy
1. Click "Deploy"
2. Esperar ~60 segundos
3. ✅ Demo live en: `https://synbio-llvm.vercel.app`

---

## 📊 Verificar deployment

### Checklist:
- [ ] Demo carga sin errores
- [ ] Monaco Editor funciona
- [ ] Ejemplos se cargan
- [ ] Compilador funciona (probar "Repressilator")
- [ ] Simulación funciona (click "Simular")
- [ ] Exportar SBOL funciona
- [ ] No hay errores en consola (F12)

### Test URL:
```
https://synbio-llvm.vercel.app
```

### Si hay errores:
1. Ir a https://vercel.com/dashboard
2. Click en tu proyecto
3. Deployments → Latest → Logs
4. Buscar error rojo
5. Fix en local → git push → auto-redeploy

---

## 🔧 Configuración avanzada

### Añadir dominio personalizado
1. Comprar dominio: `synbio-llvm.com` (€10/año en Namecheap)
2. Vercel Dashboard → Settings → Domains
3. Add Domain → `synbio-llvm.com`
4. Copiar nameservers:
   ```
   ns1.vercel-dns.com
   ns2.vercel-dns.com
   ```
5. Ir a Namecheap → Domain Management → Nameservers
6. Pegar los nameservers de Vercel
7. Esperar 5-10 min
8. ✅ Demo en `https://synbio-llvm.com`

### Añadir Analytics
1. Vercel Dashboard → Analytics → Enable
2. ✅ Ver tráfico real-time

### Variables de entorno (si las necesitas)
```bash
vercel env add NEXT_PUBLIC_API_KEY
# Pegar valor
# Seleccionar: Production, Preview, Development
```

---

## 🎯 Integración con Git

### Deploy automático en cada push:
```bash
# 1. Asegurar que Vercel está conectado a GitHub
vercel link

# 2. Ahora cada git push → auto-deploy
git add .
git commit -m "feat: new feature"
git push

# Vercel detecta el push y deploya automáticamente
# Preview URL: https://synbio-llvm-git-main-youruser.vercel.app
```

### Deploy solo desde `main` branch:
1. Vercel Dashboard → Settings → Git
2. Production Branch: `main`
3. ✅ Solo deploy de main a producción

---

## 📈 Métricas post-deploy

### Primeras 24 horas:
- [ ] 50+ visitantes únicos
- [ ] 5+ minutos tiempo promedio
- [ ] 80%+ tasa de compilación exitosa
- [ ] 0 errores en logs

### Primera semana:
- [ ] 500+ visitantes
- [ ] 10+ shares en redes sociales
- [ ] 3+ menciones en Twitter
- [ ] 20+ clics en "Export SBOL"

**Estas métricas son oro para VCs.**

---

## 🆘 Troubleshooting

### Error: "Build failed"
```powershell
# Verificar build local:
cd web-demo
npm install
npm run build

# Si funciona local pero falla en Vercel:
# → Check Node version en vercel.json
```

### Error: "Module not found"
```powershell
# Limpiar node_modules y reinstalar:
rm -r node_modules
rm package-lock.json
npm install

# Commit y push:
git add package-lock.json
git commit -m "fix: regenerate lockfile"
git push
```

### Error: "Page not found"
```
# Verificar next.config.js:
# - basePath debe estar comentado para Vercel
# - output: 'export' debe estar presente
```

### Demo muy lenta
```
# Optimizar:
1. Vercel Dashboard → Settings → Speed Insights → Enable
2. Identificar cuellos de botella
3. Añadir next/image para imágenes
4. Code splitting (ya incluido en Next.js)
```

---

## 🎁 Bonus: Vercel Analytics en README

### Añadir badge de status:
```markdown
[![Deployment](https://img.shields.io/badge/Deployed_on-Vercel-black?logo=vercel)](https://synbio-llvm.vercel.app)
```

### Añadir screenshot automático:
```markdown
![Demo](https://synbio-llvm.vercel.app/api/og)
```

---

## ✅ Checklist final

- [ ] Deploy exitoso en Vercel
- [ ] URL funciona: `https://synbio-llvm.vercel.app`
- [ ] Analytics habilitado
- [ ] Git integration activo
- [ ] README actualizado con URL de demo
- [ ] Tweet publicado con demo link
- [ ] LinkedIn post con demo link

---

## 📞 Soporte

- **Vercel Docs:** https://vercel.com/docs
- **Vercel Discord:** https://vercel.com/discord
- **Next.js:** https://nextjs.org/docs

---

## 🚀 Siguiente paso

Una vez tengas la demo live:

1. **Actualizar README.md:**
   ```markdown
   **[🎮 Try Live Demo](https://synbio-llvm.vercel.app)**
   ```

2. **Compartir en redes:**
   ```
   🧬 SynBio-LLVM is now live!
   
   Design genetic circuits with type safety.
   Try it: https://synbio-llvm.vercel.app
   
   #syntheticbiology #biotech
   ```

3. **Email a VCs:**
   ```
   Demo: https://synbio-llvm.vercel.app
   (Deployed on Vercel, <500ms load time, 99.9% uptime)
   ```

---

**¿Deployment exitoso? ¡A conseguir financiación!** 🚀
