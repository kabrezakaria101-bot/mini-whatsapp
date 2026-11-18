'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { valideNumero } from './utils';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

// Retrouve le numéro lié au Gmail, puis le profil. Renvoie { profil } ou { erreur }.
async function chargerProfil(user) {
  const email = (user.email || '').toLowerCase();
  const lien = await getDoc(doc(db, 'emails', email));
  if (!lien.exists()) {
    return { erreur: "Aucun numéro n'est associé à ce compte Gmail. Contactez l'administrateur." };
  }
  const numero = lien.data().numero;
  const snap = await getDoc(doc(db, 'users', numero));
  if (!snap.exists()) return { erreur: 'Compte introuvable. Contactez l\'administrateur.' };
  const p = snap.data();
  if (!p.actif) {
    return {
      erreur:
        p.statut === 'bloque'
          ? 'Ce numéro est bloqué. Contactez l\'administrateur.'
          : 'Ce numéro est désactivé. Contactez l\'administrateur.',
    };
  }
  return { profil: { ...p, numero } };
}

export function AuthProvider({ children }) {
  const [profil, setProfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const verification = useRef(false);

  // Restaure la session au rechargement de la page
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (verification.current) return; // la connexion manuelle gère elle-même le profil
      if (!user) {
        setProfil(null);
        setLoading(false);
        return;
      }
      try {
        const r = await chargerProfil(user);
        if (r.profil) setProfil(r.profil);
        else {
          await signOut(auth);
          setProfil(null);
        }
      } catch {
        setProfil(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Connexion : Gmail (popup Google) + numéro à 5 chiffres qui doit correspondre
  const login = useCallback(async (numero) => {
    if (!valideNumero(numero)) return { erreur: 'Entrez votre numéro à 5 chiffres.' };
    verification.current = true;
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const r = await chargerProfil(cred.user);
      if (r.erreur) {
        await signOut(auth);
        return { erreur: r.erreur };
      }
      if (r.profil.numero !== numero) {
        await signOut(auth);
        return { erreur: "Ce numéro ne correspond pas à ce compte Gmail." };
      }
      setProfil(r.profil);
      return { ok: true };
    } catch (e) {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
        return { erreur: 'Connexion annulée.' };
      }
      if (e.code === 'auth/popup-blocked') {
        return { erreur: 'Le navigateur a bloqué la fenêtre Google. Autorisez les popups et réessayez.' };
      }
      if (e.code === 'permission-denied') {
        return { erreur: "Accès refusé. Vérifiez que les règles de sécurité sont bien déployées." };
      }
      return { erreur: 'Connexion impossible. Vérifiez votre connexion internet.' };
    } finally {
      verification.current = false;
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setProfil(null);
  }, []);

  return (
    <Ctx.Provider value={{ profil, setProfil, loading, login, logout }}>{children}</Ctx.Provider>
  );
}
