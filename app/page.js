'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function PageConnexion() {
  const { profil, loading, login } = useAuth();
  const router = useRouter();
  const [numero, setNumero] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);

  // Redirection : admin -> /admin, utilisateur -> /app
  useEffect(() => {
    if (!loading && profil) router.replace(profil.role === 'admin' ? '/admin' : '/app');
  }, [loading, profil, router]);

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    setOccupe(true);
    const r = await login(numero);
    setOccupe(false);
    if (r?.erreur) setErreur(r.erreur);
  }

  if (loading || profil) return <div className="centre">Chargement…</div>;

  return (
    <div className="connexion">
      <form className="carte" onSubmit={soumettre}>
        <div className="logo">💬</div>
        <h1>Mini-WhatsApp</h1>
        <p className="sous-titre">Messages gratuits avec votre numéro à 5 chiffres</p>

        <label htmlFor="numero">Votre numéro (5 chiffres)</label>
        <input
          id="numero"
          className="champ gros"
          inputMode="numeric"
          autoComplete="off"
          maxLength={5}
          placeholder="12345"
          value={numero}
          onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))}
        />

        <button className="btn primaire" disabled={occupe || numero.length !== 5}>
          {occupe ? 'Connexion…' : 'Se connecter avec Google'}
        </button>

        {erreur && <p className="erreur">{erreur}</p>}

        <p className="aide">
          Votre numéro vous est attribué par l&apos;administrateur et lié à votre adresse Gmail.
          Vous n&apos;avez pas encore de numéro ? Contactez l&apos;administrateur.
        </p>
      </form>
    </div>
  );
}
