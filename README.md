# ⛽ FuelMap PWA — Guide de déploiement

## Structure des fichiers

```
fuelmap/
├── index.html           ← App principale (toujours servir en HTTPS)
├── manifest.json        ← Manifeste PWA
├── sw.js                ← Service Worker (cache, offline, push)
├── offline.html         ← Page affichée hors-ligne
├── generate-icons.html  ← Outil de génération des icônes PNG
└── icons/
    ├── icon.svg         ← Source SVG (base de toutes les icônes)
    ├── icon-72.png
    ├── icon-96.png
    ├── icon-128.png
    ├── icon-144.png
    ├── icon-152.png
    ├── icon-180.png
    ├── icon-192.png
    ├── icon-512.png
    ├── icon-maskable-192.png
    ├── icon-maskable-512.png
    ├── shortcut-sp95.png
    ├── shortcut-gazole.png
    └── shortcut-e10.png
```

---

## 1. Générer les icônes PNG

1. Ouvrez `generate-icons.html` dans un navigateur
2. Cliquez **Générer & télécharger toutes les icônes**
3. Téléchargez chaque icône → placez-les dans `icons/`

---

## 2. Prérequis de déploiement

> ⚠️ **HTTPS obligatoire** — Le Service Worker et la géolocalisation ne fonctionnent **que** sur HTTPS (ou localhost pour les tests).

### Options de déploiement rapides

| Service        | Commande                      | HTTPS auto |
|----------------|-------------------------------|-----------|
| **Netlify**    | Glissez le dossier sur netlify.com | ✅ |
| **Vercel**     | `vercel --prod`               | ✅ |
| **GitHub Pages** | Push + activer Pages        | ✅ |
| **Nginx local** | Voir config ci-dessous       | Manuel    |

### Configuration Nginx minimale
```nginx
server {
    listen 443 ssl;
    server_name votre-domaine.fr;
    root /var/www/fuelmap;
    index index.html;

    # Requis pour PWA
    location /sw.js {
        add_header Cache-Control "no-cache";
        add_header Service-Worker-Allowed "/";
    }
    location /manifest.json {
        add_header Cache-Control "no-cache";
    }

    # Assets statiques : cache long
    location ~* \.(png|svg|css|js|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Toujours servir index.html (SPA)
    try_files $uri $uri/ /index.html;
}
```

---

## 3. Checklist PWA 2026 ✅

### Requis
- [x] `manifest.json` complet avec `name`, `short_name`, `icons`, `start_url`, `display`
- [x] Service Worker enregistré
- [x] HTTPS (ou localhost)
- [x] Icônes 192px et 512px
- [x] `theme-color` meta tag
- [x] `viewport` meta tag

### Recommandé
- [x] Icônes `maskable` (pour Android adaptive icons)
- [x] `display_override: ["window-controls-overlay", "standalone"]`
- [x] Raccourcis clavier (`shortcuts` dans manifest)
- [x] Page offline (`offline.html`)
- [x] Cache stratégique (static + API)
- [x] Support safe-area iOS (notch, Dynamic Island)
- [x] `viewport-fit=cover`
- [x] Bottom navigation mobile
- [x] Géolocalisation
- [x] Indicateur offline
- [x] Prompt d'installation Android (beforeinstallprompt)
- [x] Instructions d'installation iOS
- [x] Haptic feedback (`navigator.vibrate`)
- [x] `enterkeyhint="search"` sur les inputs mobile

### Optionnel (à implémenter si besoin)
- [ ] Push notifications (nécessite backend)
- [ ] Periodic Background Sync (vérifier support navigateur)
- [ ] Share Target (partager une station)
- [ ] Badging API (compter les stations)

---

## 4. Bugs corrigés vs version initiale

| # | Bug | Correction |
|---|-----|-----------|
| 1 | `--select-arrow` CSS variable dans `url()` data URI | Deux déclarations séparées par thème |
| 2 | `let currentTile` déclaré après utilisation | Déclaré en tête de script avec tous les états |
| 3 | `maps://` pour Apple Maps | Remplacé par `https://maps.apple.com/` |
| 4 | Sidebar mobile en plein écran overlay | Bottom sheet draggable + bottom nav |
| 5 | Pas de `manifest.json` → PWA non installable | Fichier créé complet |
| 6 | Pas de `sw.js` → pas de cache offline | Service worker complet |
| 7 | `viewport-fit` manquant → pas de support notch iOS | `viewport-fit=cover` ajouté |
| 8 | Pas de détection offline | Bannière + indicator dot |
| 9 | URL params non gérés (shortcuts) | `handleUrlParams()` implémenté |
| 10 | Sync desktop ↔ mobile inputs | Inputs synchronisés à chaque recherche |

---

## 5. APIs utilisées

| API | URL | Usage |
|-----|-----|-------|
| Prix carburants | `data.economie.gouv.fr` | Données officielles gouvernement |
| Géocodage | `geo.api.gouv.fr` | Ville → coordonnées GPS |
| Carte | CartoDB (CARTO) | Tuiles carte sombre/claire |
| Carte (lib) | Leaflet 1.9.4 | Affichage carte interactive |

---

## 6. Performances cibles

- **FCP** < 1.5s (grâce au cache Service Worker)
- **TTI** < 3s
- **Lighthouse PWA** : 100/100
- **Lighthouse Performance** : > 90

Pour mesurer : `npx lighthouse https://votre-site.fr --view`
