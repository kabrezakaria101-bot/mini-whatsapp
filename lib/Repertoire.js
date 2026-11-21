'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { valideNumero } from '@/lib/utils';

// Écoute mon répertoire : { '83791': { numero: '83791', nom: 'Abdoul' }, ... }
export function useRepertoire(numero) {
  const [rep, setRep] = useState({});
  useEffect(() => {
    if (!numero) return;
    return onSnapshot(
      collection(db, 'users', numero, 'repertoire'),
      (s) => {
        const m = {};
        s.docs.forEach((d) => { m[d.id] = d.data(); });
        setRep(m);
      },
      () => {}
    );
  }, [numero]);
  return rep;
}

async function enregistrer(moi, n, nom) {
  if (!valideNumero(n)) throw new Error('Entrez un numéro à 5 chiffres.');
  if (n === moi) throw new Error("C'est votre propre numéro.");
  let s;
  try { s = await getDoc(doc(db, 'users', n)); } catch { throw new Error('Vérification impossible. Réessayez.'); }
  if (!s.exists() || !s.data().actif) throw new Error("Ce numéro n'existe pas ou n'est pas actif.");
  const propre = (nom || '').trim().slice(0, 40) || s.data().nom || n;
  try {
    await setDoc(doc(db, 'users', moi, 'repertoire', n), { numero: n, nom: propre });
  } catch {
    throw new Error('Enregistrement refusé (règles Firebase non à jour ?).');
  }
}

export function Repertoire({ moi, repertoire, onChoisir, onOuvrirNumero, onFermer,onNouveauGroupe }) {
  const [recherche, setRecherche] = useState('');
  const [ajout, setAjout] = useState(false);
  const [nNum, setNNum] = useState('');
  const [nNom, setNNom] = useState('');
  const [msg, setMsg] = useState(null);
  const [occupe, setOccupe] = useState(false);

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return Object.values(repertoire)
      .filter((c) => !q || c.numero.includes(q) || (c.nom || '').toLowerCase().includes(q))
      .sort((a, b) => (a.nom || '').localeCompare(b.nom || '', 'fr', { sensitivity: 'base' }));
  }, [repertoire, recherche]);

  const numeroLibre = valideNumero(recherche) && !repertoire[recherche] && recherche !== moi;

  async function ajouter(e) {
    e.preventDefault();
    setMsg(null);
    setOccupe(true);
    try {
      await enregistrer(moi, nNum, nNom);
      setMsg({ type: 'ok', texte: `Contact ${nNum} enregistré.` });
      setNNum(''); setNNom(''); setAjout(false);
    } catch (err) {
      setMsg({ type: 'erreur', texte: err.message });
    }
    setOccupe(false);
  }

  async function supprimer(n) {
    if (!confirm(`Retirer ${repertoire[n]?.nom || n} de votre répertoire ?`)) return;
    deleteDoc(doc(db, 'users', moi, 'repertoire', n)).catch(() => setMsg({ type: 'erreur', texte: 'Suppression impossible.' }));
  }

  async function ecrire(n) {
    const err = await onOuvrirNumero(n);
    if (err) setMsg({ type: 'erreur', texte: err });
  }

  // Importe les numéros à 5 chiffres des contacts du téléphone (Chrome sur Android)
  async function importerTel() {
    setMsg(null);
    if (!('contacts' in navigator) || !('ContactsManager' in window)) {
      return setMsg({ type: 'erreur', texte: "Importation impossible ici. Utilisez Chrome sur Android, ou ajoutez les numéros à la main." });
    }
    try {
      const choisis = await navigator.contacts.select(['name', 'tel'], { multiple: true });
      const trouves = new Map();
      for (const c of choisis) {
        for (const t of c.tel || []) {
          const n = String(t).replace(/\D/g, '');
          if (valideNumero(n) && n !== moi && !repertoire[n] && !trouves.has(n)) trouves.set(n, (c.name && c.name[0]) || '');
        }
      }
      if (!trouves.size) return setMsg({ type: 'erreur', texte: 'Aucun nouveau numéro à 5 chiffres dans les contacts choisis.' });
      setOccupe(true);
      let ok = 0;
      await Promise.all([...trouves].slice(0, 100).map(async ([n, nom]) => {
        try { await enregistrer(moi, n, nom); ok += 1; } catch { /* numéro inconnu : on l'ignore */ }
      }));
      setOccupe(false);
      setMsg(ok
        ? { type: 'ok', texte: `${ok} contact(s) ajouté(s).` }
        : { type: 'erreur', texte: "Aucun de ces numéros n'existe sur Mini-WhatsApp." });
    } catch {
      setOccupe(false); // choix annulé
    }
  }

  const initiale = (c) => (c.nom || c.numero || '#').trim().charAt(0).toUpperCase();

  return (
    <div className="rep">
      <header className="barre">
        <button className="icone" onClick={onFermer} aria-label="Retour">←</button>
        <div className="moi">
          <strong>Nouveau message</strong>
          <small>{Object.keys(repertoire).length} contact(s)</small>
        </div>
      </header>

      <div className="rep-recherche">
        <input
          className="champ"
          placeholder="Nom ou numéro…"
          value={recherche}
          onChange={(e) => { setRecherche(e.target.value); setMsg(null); }}
        />
      </div>
      {msg && <p className={(msg.type === 'ok' ? 'succes' : 'erreur') + ' marge'}>{msg.texte}</p>}

      <ul className="liste">
       <li>
  <button className="item" onClick={() => { setAjout((a) => !a); setMsg(null); }}>
    <div className="avatar rep-ico">＋</div>
    <div className="item-texte"><strong>Nouveau contact</strong></div>
  </button>
</li>

{onNouveauGroupe && (
  <li>
    <button className="item" onClick={onNouveauGroupe}>
      <div className="avatar rep-ico">👥</div>
      <div className="item-texte"><strong>Nouveau groupe</strong></div>
    </button>
  </li>
)}

        
        {ajout && (
          <li>
            <form className="rep-form" onSubmit={ajouter}>
              <input className="champ" inputMode="numeric" maxLength={5} placeholder="Numéro à 5 chiffres"
                value={nNum} onChange={(e) => setNNum(e.target.value.replace(/\D/g, ''))} />
              <input className="champ" maxLength={40} placeholder="Nom (facultatif)"
                value={nNom} onChange={(e) => setNNom(e.target.value)} />
              <button className="btn primaire" disabled={occupe || nNum.length !== 5}>{occupe ? '…' : 'Enregistrer'}</button>
            </form>
          </li>
        )}
        <li>
          <button className="item" onClick={importerTel} disabled={occupe}>
            <div className="avatar rep-ico" style={{ width: 46, height: 46, fontSize: 22 }}>📱</div>
            <div className="item-texte"><strong>Importer depuis mon téléphone</strong><small className="num-petit">Les numéros à 5 chiffres de vos contacts</small></div>
          </button>
        </li>
        {numeroLibre && (
          <li>
            <button className="item" onClick={() => ecrire(recherche)}>
              <div className="avatar" style={{ width: 46, height: 46, fontSize: 20 }}>#</div>
              <div className="item-texte"><strong>Écrire au numéro {recherche}</strong></div>
            </button>
          </li>
        )}

        <li className="rep-titre">Mes contacts</li>
        {liste.map((c) => (
          <li key={c.numero}>
            <div className="item rep-ligne">
              <button className="rep-main" onClick={() => onChoisir(c.numero)}>
                <div className="avatar" style={{ width: 46, height: 46, fontSize: 20 }}>{initiale(c)}</div>
                <div className="item-texte">
                  <strong>{c.nom || c.numero}</strong>
                  <small className="num-petit">{c.numero}</small>
                </div>
              </button>
              <button className="icone" onClick={() => supprimer(c.numero)} title="Retirer du répertoire">🗑</button>
            </div>
          </li>
        ))}
        {!liste.length && (
          <li className="vide-liste">
            {Object.keys(repertoire).length ? 'Aucun contact ne correspond.' : 'Aucun contact enregistré. Utilisez « Nouveau contact » ou « Importer ».'}
          </li>
        )}
      </ul>
    </div>
  );
}

