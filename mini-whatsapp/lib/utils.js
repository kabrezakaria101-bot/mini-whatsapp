// Numéro valide : exactement 5 chiffres, de 10000 à 99999
export const valideNumero = (n) => /^[1-9][0-9]{4}$/.test(String(n || ''));

export function enMs(ts) {
  if (!ts) return Date.now();
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  return Date.now();
}

export function heure(ts) {
  return new Date(enMs(ts)).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function dateCourte(ts) {
  const d = new Date(enMs(ts));
  const auj = new Date();
  if (d.toDateString() === auj.toDateString()) return heure(ts);
  const hier = new Date(Date.now() - 86400000);
  if (d.toDateString() === hier.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function dateLongue(ts) {
  return new Date(enMs(ts)).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function dateHeure(ts) {
  if (!ts) return '—';
  return new Date(enMs(ts)).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Réduit une photo à ~160px et la renvoie en texte (data URL) : pas besoin de Firebase Storage
export function redimensionnerImage(fichier, taille = 160) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(fichier);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = taille;
      canvas.height = taille;
      const ctx = canvas.getContext('2d');
      const cote = Math.min(img.width, img.height);
      const sx = (img.width - cote) / 2;
      const sy = (img.height - cote) / 2;
      ctx.drawImage(img, sx, sy, cote, cote, 0, 0, taille, taille);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = url;
  });
}
