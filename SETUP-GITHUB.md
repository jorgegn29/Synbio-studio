# 🚀 Setup GitHub en 5 Minutos

## Paso 1: Crear cuenta GitHub (si no tienes)
1. Ir a https://github.com/signup
2. Email personal → Verificar
3. Username profesional (ej: "alex-biotech", "synbio-dev")

## Paso 2: Crear repositorio público
1. Click en "+" (arriba derecha) → "New repository"
2. Nombre: `synbio-llvm`
3. ✅ Public
4. ❌ NO añadir README (ya tenemos)
5. Click "Create repository"

## Paso 3: Subir el código

### Opción A: Desde PowerShell (RECOMENDADO)

```powershell
cd C:\Users\Usuario\Desktop\SynBio-LLVM-Proyecto

# Inicializar Git
git init
git add .
git commit -m "🎉 Initial commit: SynBio-LLVM v0.1.0

- Complete BioScript compiler (23,469 LOC)
- VS Code extension with 27 commands
- Web demo with Monaco Editor
- Gillespie stochastic simulator
- 34+ scientific papers integrated
- SBOL 3.0 export support"

# Conectar a tu repo (CAMBIA YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/synbio-llvm.git
git branch -M main

# Subir código
git push -u origin main
```

### Opción B: Desde GitHub Desktop (más fácil)
1. Descargar GitHub Desktop: https://desktop.github.com
2. Instalar y login
3. File → Add Local Repository → Seleccionar carpeta SynBio-LLVM-Proyecto
4. Click "Publish repository"
5. ✅ Keep this code public
6. Click "Publish repository"

## Paso 4: README espectacular
```powershell
# Renombrar README para GitHub
mv README.md README-OLD.md
mv README-GITHUB.md README.md

git add README.md
git commit -m "📝 Add stunning README for investors"
git push
```

## Paso 5: Configurar GitHub Pages
1. Ir a tu repo: https://github.com/YOUR_USERNAME/synbio-llvm
2. Settings → Pages
3. Source: **GitHub Actions**
4. ✅ Guardar

En 2 minutos, tu demo estará en:
**https://YOUR_USERNAME.github.io/synbio-llvm/**

## Paso 6: Actualizar badges en README
Edita README.md y cambia:
```markdown
[![Build Status](https://img.shields.io/github/actions/workflow/status/YOUR_USERNAME/synbio-llvm/ci.yml?branch=main)](https://github.com/YOUR_USERNAME/synbio-llvm/actions)
```

Por tu username real.

## Paso 7: Añadir topics al repo
1. En tu repo GitHub → About (rueda dentada)
2. Topics: `synthetic-biology`, `bioinformatics`, `compiler`, `vscode-extension`, `rust`, `typescript`, `igem`, `sbol`
3. Guardar

## ✅ Checklist Final

- [ ] Repositorio creado y público
- [ ] Código subido (git push exitoso)
- [ ] README.md impactante
- [ ] GitHub Pages configurado
- [ ] Topics añadidos
- [ ] LICENSE visible
- [ ] Demo funcionando: https://YOUR_USERNAME.github.io/synbio-llvm/

## 🎯 Siguientes Pasos

1. **Deploy Vercel** (más rápido que GitHub Pages):
   ```powershell
   cd web-demo
   npx vercel
   # → Login con GitHub
   # → Configuración automática
   # → URL: https://synbio-llvm.vercel.app
   ```

2. **Postear Hacker News** (mañana, 10 AM):
   - Ir a https://news.ycombinator.com/submit
   - Título: "Show HN: SynBio-LLVM – Type-safe compiler for genetic circuits"
   - URL: https://github.com/YOUR_USERNAME/synbio-llvm

3. **LinkedIn post** (hoy):
   ```
   🧬 After 6 months of work, I'm proud to release SynBio-LLVM — an open-source compiler that brings software engineering rigor to genetic circuit design.
   
   ✅ 23,469 lines of production code
   ✅ VS Code integration
   ✅ Real-time simulation
   ✅ Web demo (try it now!)
   
   Built to help the 400+ iGEM teams worldwide design safer, better circuits.
   
   🔗 https://github.com/YOUR_USERNAME/synbio-llvm
   🎮 Demo: https://synbio-llvm.vercel.app
   
   #syntheticbiology #biotech #opensource #compiler
   ```

4. **Email a VCs** (esta semana):
   - Ver lista en ESTRATEGIA-FUNDRAISING-ESPAÑA.md
   - Template incluido en el documento

---

## 🆘 Problemas comunes

### "Permission denied (publickey)"
```powershell
# Configurar SSH key
ssh-keygen -t ed25519 -C "tu_email@example.com"
# Enter, Enter, Enter
cat ~/.ssh/id_ed25519.pub
# Copiar output

# Ir a GitHub → Settings → SSH keys → New SSH key
# Pegar la clave pública
```

### "Failed to push"
```powershell
# Si el repo remoto está vacío, forzar push:
git push -u origin main --force
```

### "Large files warning"
```powershell
# Añadir a .gitignore:
echo "*.vsix" >> .gitignore
echo "*.exe" >> .gitignore
echo "target/" >> .gitignore
echo "node_modules/" >> .gitignore

git add .gitignore
git commit -m "chore: ignore large binaries"
```

---

## 📊 Métricas de éxito (primeras 24h)

Objetivo:
- [ ] 10 estrellas en GitHub
- [ ] 3 forks
- [ ] 100 visitantes a la demo
- [ ] 20 upvotes en Hacker News
- [ ] 50 reacciones en LinkedIn

**Si consigues esto en 24h, tienes tracción para pitchear a VCs.**

---

¿Necesitas ayuda con algún paso? Dime y te guío.
