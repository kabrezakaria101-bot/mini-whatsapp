import { collection, doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Taille maximale d'une photo ou d'un vocal (en caractères). Doit rester identique dans firestore.rules.
export const MAX_CARACTERES = 700000;
export const DUREE_MAX_VOCAL = 90; // secondes

export const fmtDuree = (s) => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, '0')}`;

// Mémoire pour ne pas retélécharger la même photo/vocal plusieurs fois
const cache = new Map();

// Réduit une photo (côté le plus long : 900 px) et la renvoie sous forme de texte (data URL)
export function redimensionnerPhoto(fichier, max = 900) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(fichier);
    img.onload = () => {
      const ratio = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      let data = canvas.toDataURL('image/jpeg', 0.65);
      if (data.length > MAX_CARACTERES) data = canvas.toDataURL('image/jpeg', 0.4);
      if (data.length > MAX_CARACTERES) return reject(new Error('Photo trop lourde'));
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image illisible'));
    };
    img.src = url;
  });
}

export function blobEnTexte(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Lecture impossible'));
    r.readAsDataURL(blob);
  });
}

// Envoie une photo ou un vocal : un document "medias" (le fichier) + un document "messages" (la bulle)
export async function envoyerMedia(moi, dest, type, data, duree = 0) {
  if (!data || data.length > MAX_CARACTERES) throw new Error('Fichier trop lourd pour être envoyé.');
  const media = doc(collection(db, 'medias'));
  const msg = doc(collection(db, 'messages'));
  cache.set(media.id, data); // affichage immédiat chez l'expéditeur
  const message = {
    expediteur: moi,
    destinataire: dest,
    texte: type === 'image' ? '📷 Photo' : `🎤 Message vocal ${fmtDuree(duree)}`,
    type,
    mediaId: media.id,
    date: serverTimestamp(),
    lu: false,
    participants: [moi, dest],
  };
  if (type === 'audio') message.duree = duree;
  const b = writeBatch(db);
  b.set(media, { expediteur: moi, destinataire: dest, participants: [moi, dest], type, data });
  b.set(msg, message);
  try {
    await b.commit();
  } catch (e) {
    if (e.code === 'permission-denied') throw new Error("Envoi refusé (numéro désactivé ou règles non à jour).");
    throw new Error("L'envoi a échoué. Vérifiez votre connexion.");
  }
}

export async function chargerMedia(id) {
  if (cache.has(id)) return cache.get(id);
  const s = await getDoc(doc(db, 'medias', id));
  if (!s.exists()) throw new Error('introuvable');
  const data = s.data().data;
  cache.set(id, data);
  return data;
}
