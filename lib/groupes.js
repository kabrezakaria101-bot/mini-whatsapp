'use client';

import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function useGroupes(numero) {
  const [groupes, setGroupes] = useState([]);
  useEffect(() => {
    if (!numero) return;
    const q = query(collection(db, 'groupes'), where('membres', 'array-contains', numero));
    return onSnapshot(q, (s) => setGroupes(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
  }, [numero]);
  return groupes;
}

export function NouveauGroupe({ moi, repertoire, onFermer, onCree }) {
  const [nom, setNom] = useState('');
  const [choisis, setChoisis] = useState([]);
  const [msg, setMsg] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const contacts = Object.values(repertoire).sort((a, b) =>
    (a.nom || '').localeCompare(b.nom || '', 'fr', { sensitivity: 'base' }));

  const basculer = (n) => setChoisis((c) => (c.includes(n) ? c.filter((x) => x !== n) : [...c, n]));

  async function creer() {
    setMsg(null);
    if (!nom.trim()) return setMsg('Donnez un nom au groupe.');
    if (!choisis.length) return setMsg('Choisissez au moins un membre.');
    setOccupe(true);
    try {
      const donnees = { nom: nom.trim().slice(0, 40), admin: moi, membres: [moi, ...choisis] };
      const ref = await addDoc(collection(db, 'groupes'), { ...donnees, creeLe: serverTimestamp() });
      onCree({ id: ref.id, ...donnees });
    } catch {
      setMsg('Création refusée (règles Firebase non déployées ?).');
    }
    setOccupe(false);
  }

  return (
    <div className="rep">
      <header className="barre">
        <button className="icone" onClick={onFermer} aria-label="Retour">←</button>
        <div className="moi">
          <strong>Nouveau groupe</strong>
          <small>{choisis.length} membre(s) choisi(s)</small>
        </div>
      </header>
      <div className="rep-recherche">
        <input className="champ" maxLength={40} placeholder="Nom du groupe"
          value={nom} onChange={(e) => setNom(e.target.value)} />
      </div>
      {msg && <p className="erreur marge">{msg}</p>}
      <ul className="liste">
        {contacts.map((c) => (
          <li key={c.numero}>
            <button className="item" onClick={() => basculer(c.numero)}>
              <div className="avatar" style={{ width: 46, height: 46, fontSize: 20 }}>
                {choisis.includes(c.numero) ? '✓' : (c.nom || c.numero).charAt(0).toUpperCase()}
              </div>
              <div className="item-texte">
                <strong>{c.nom || c.numero}</strong>
                <small className="num-petit">{c.numero}</small>
              </div>
            </button>
          </li>
        ))}
        {!contacts.length && <li className="vide-liste">Enregistrez d'abord des contacts.</li>}
      </ul>
      <div style={{ padding: 12 }}>
        <button className="btn primaire" style={{ width: '100%' }} onClick={creer} disabled={occupe}>
          {occupe ? '…' : 'Créer le groupe'}
        </button>
      </div>
    </div>
  );
}

export function DiscussionGroupe({ moi, groupe, repertoire, onFermer }) {
  const [messages, setMessages] = useState([]);
  const [texte, setTexte] = useState('');
  const bas = useRef(null);
  const nomDe = (n) => (n === moi ? 'Moi' : repertoire[n]?.nom || n);

  useEffect(() => {
    const q = query(collection(db, 'groupes', groupe.id, 'messages'), orderBy('date'));
    return onSnapshot(q, (s) => setMessages(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
  }, [groupe.id]);

  useEffect(() => { bas.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function envoyer(e) {
    e.preventDefault();
    const t = texte.trim();
    if (!t) return;
    setTexte('');
    addDoc(collection(db, 'groupes', groupe.id, 'messages'), {
      de: moi, texte: t.slice(0, 2000), date: serverTimestamp(),
    }).catch(() => setTexte(t));
  }

  return (
    <div className="rep" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <header className="barre">
        <button className="icone" onClick={onFermer} aria-label="Retour">←</button>
        <div className="moi">
          <strong>{groupe.nom}</strong>
          <small>{groupe.membres.map(nomDe).join(', ')}</small>
        </div>
      </header>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {messages.map((m) => (
          <div key={m.id} style={{
            alignSelf: m.de === moi ? 'flex-end' : 'flex-start', maxWidth: '80%',
            background: m.de === moi ? '#d9fdd3' : '#fff', color: '#111',
            borderRadius: 10, padding: '6px 10px', boxShadow: '0 1px 1px rgba(0,0,0,.15)',
          }}>
            {m.de !== moi && <small style={{ display: 'block', color: '#06795f' }}>{nomDe(m.de)}</small>}
            {m.texte}
          </div>
        ))}
        <div ref={bas} />
      </div>
      <form onSubmit={envoyer} style={{ display: 'flex', gap: 8, padding: 10 }}>
        <input className="champ" style={{ flex: 1 }} placeholder="Écrire un message"
          value={texte} onChange={(e) => setTexte(e.target.value)} />
        <button className="btn primaire">Envoyer</button>
      </form>
    </div>
  );
}
