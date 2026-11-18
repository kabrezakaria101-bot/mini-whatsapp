# Mini-WhatsApp — numéros courts à 5 chiffres

Messagerie web (Next.js + Firebase) où chaque utilisateur a un numéro à 5 chiffres lié à son Gmail.
Un seul code, deux parties : `/admin` (vous) et `/app` (les utilisateurs).

## Structure

```
app/page.js          Page de connexion (Gmail + numéro) et redirection selon le rôle
app/admin/page.js    Administration : créer/activer/bloquer/supprimer, stats, paiements
app/app/page.js      Messagerie style WhatsApp Web (liste à gauche, discussion à droite)
lib/                 Connexion Firebase, authentification, utilitaires
firestore.rules      Règles de sécurité (le plus important)
firestore.indexes.json  Index nécessaire pour la liste des messages
```

## Déploiement étape par étape

### 1. Installer les outils (sur PC)
- Installez **Node.js 20 ou plus** : https://nodejs.org
- Un compte **Google** et un compte **GitHub** (gratuits).

### 2. Créer le projet Firebase
1. https://console.firebase.google.com → **Ajouter un projet** (ex. `mini-whatsapp-bf`). Google Analytics : inutile.
2. **Authentication** → *Commencer* → onglet *Sign-in method* → activez **Google** → choisissez votre Gmail comme e-mail d'assistance → Enregistrer.
3. **Firestore Database** → *Créer une base de données* → mode **Production** → choisissez une région proche (ex. `eur3` ou `europe-west1`).
4. **Paramètres du projet** (roue dentée) → *Vos applications* → icône **Web `</>`** → donnez un nom → copiez les 4 valeurs : `apiKey`, `authDomain`, `projectId`, `appId`.

### 3. Configurer le projet
Dans le dossier du projet :
```
cp .env.local.example .env.local
```
Ouvrez `.env.local` et collez vos 4 valeurs Firebase.

### 4. Déployer les règles de sécurité et l'index
```
npm install -g firebase-tools
firebase login
firebase use --add        # choisissez votre projet
firebase deploy --only firestore
```
(Alternative sans terminal : Console Firebase → Firestore → onglet *Règles*, collez le contenu de `firestore.rules`, *Publier*. L'index sera alors à créer en cliquant sur le lien qui apparaît dans la console du navigateur au premier chargement de `/app`.)

### 5. Créer le premier compte admin (à la main, une seule fois)
Les règles interdisent de créer un compte sans être admin, donc le tout premier se crée dans la console Firebase (la console ignore les règles).
Console Firebase → **Firestore Database** → *Démarrer une collection* :

**Collection `emails`** — ID du document = **votre Gmail en minuscules** (ex. `moi@gmail.com`) — champs :
| champ | type | valeur |
|---|---|---|
| email | string | `moi@gmail.com` |
| numero | string | `10000` (vos 5 chiffres, **en texte**) |

**Collection `users`** — ID du document = `10000` (votre numéro) — champs :
| champ | type | valeur |
|---|---|---|
| numero | string | `10000` |
| nom | string | `Admin` |
| photo | string | *(vide)* |
| role | string | `admin` |
| actif | boolean | `true` |
| statut | string | `actif` |

Attention : le Gmail doit être écrit exactement comme Google le renvoie, en minuscules, et le numéro doit être de type **string**.

### 6. Tester en local
```
npm install
npm run dev
```
Ouvrez http://localhost:3000 → tapez votre numéro admin → *Se connecter avec Google*. Vous arrivez sur `/admin`. Créez ensuite un 2e numéro avec un autre Gmail, et testez le chat avec deux navigateurs (ou un navigateur normal + une fenêtre privée).

### 7. Mettre en ligne (Vercel, gratuit)
1. Mettez le dossier sur GitHub (nouveau dépôt, puis `git init`, `git add .`, `git commit`, `git push`). Le fichier `.env.local` n'est pas envoyé (c'est voulu).
2. https://vercel.com → *Add New Project* → importez le dépôt.
3. Avant de déployer, ouvrez **Environment Variables** et ajoutez les 4 variables `NEXT_PUBLIC_FIREBASE_…` avec les mêmes valeurs que `.env.local`.
4. *Deploy*. Vous obtenez une adresse `https://votre-projet.vercel.app`.
5. **Étape souvent oubliée** : Firebase → Authentication → *Paramètres* → **Domaines autorisés** → *Ajouter un domaine* → `votre-projet.vercel.app` (et votre propre domaine plus tard). Sans cela, la connexion Google échoue.

### 8. Au quotidien
Un utilisateur vous donne son Gmail → `/admin` → *Créer un numéro* (ou « Au hasard ») → vous lui communiquez son numéro → il se connecte sur le site avec ce numéro + son Gmail. Sur Android, Chrome → menu → *Ajouter à l'écran d'accueil*.

## Règles de sécurité (résumé)
- Seul un admin actif peut créer/modifier/supprimer des numéros ; l'unicité est garantie (le numéro est l'ID du document).
- Un utilisateur lit uniquement les messages dont il est expéditeur ou destinataire, et ne peut envoyer que sous son propre numéro.
- Seul le destinataire peut marquer un message « lu ».
- Un utilisateur peut modifier seulement son nom et sa photo.
- Même l'admin ne peut pas lire les messages des utilisateurs : ses statistiques viennent d'un compteur.
- Un numéro désactivé/bloqué ne peut plus lire ni envoyer.

## Limites à connaître
- **Quotas gratuits Firebase (Spark)** : ~20 000 écritures et 50 000 lectures par jour. Chaque message coûte environ 3 écritures (message, compteur, marqué « lu »). Au-delà de quelques centaines d'utilisateurs actifs, passez au forfait Blaze (paiement à l'usage, cela reste peu coûteux au début) et mettez un plafond de dépense.
- **Notifications** : elles fonctionnent quand l'application est ouverte (même en arrière-plan dans l'onglet). Les notifications quand l'application est fermée demandent Firebase Cloud Messaging + une Cloud Function (à ajouter ensuite).
- **Messages non chiffrés de bout en bout** : ils sont protégés par les règles Firebase mais stockés lisibles côté serveur. Ne promettez pas le chiffrement « comme WhatsApp ».
- **Données** : la liste des discussions charge les 1 000 derniers messages. Pour une très grosse utilisation, il faudra passer à une collection `conversations`.
- **Mobile Android** : le site fonctionne dans Chrome. Une vraie application Flutter et les appels (WebRTC/Agora) sont la phase 2.
- **Sécurité des numéros à 5 chiffres** : il n'y a que 90 000 numéros possibles, donc n'importe qui peut deviner qu'un numéro existe (le chat vérifie l'existence d'un numéro). Cela ne donne accès à rien d'autre, mais ne comptez pas sur le secret du numéro.
