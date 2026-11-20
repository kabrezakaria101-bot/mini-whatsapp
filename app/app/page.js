'use client';
import { NouveauGroupe, DiscussionGroupe, useGroupes } from '@/lib/groupes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  collection, query, where, orderBy, limit, onSnapshot, addDoc, writeBatch,
  doc, getDoc, updateDoc, deleteDoc, arrayUnion, serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { envoyerMedia } from '@/lib/medias';
import { ContenuMessage, BarreSaisie } from './Medias';
import { valideNumero, heure, dateCourte, dateLongue, enMs, redimensionnerImage, presence } from '@/lib/utils';

function Avatar({ nom, photo, taille = 46 }) {
  const style = { width: taille, height: taille, fontSize: taille * 0.45 };
  if (photo) return <img className="avatar" src={photo} alt="" style={style} />;
  return <div className="avatar" style={style}>{(nom || '#').trim().charAt(0).toUpperCase()}</div>;
}

export default function PageMessagerie() {
  const { profil, setProfil, loading, logout } = useAuth();
  const router = useRouter();
  const numero = profil?.numero;

  const groupes = useGroupes(profile?.numero);
const [creerGroupe, setCreerGroupe] = useState(false);
const [groupeOuvert, setGroupeOuvert] = useState(null);


  const [messages, setMessages] = useState([]); // tous mes messages (récents d'abord)
  const [ouvert, setOuvert] = useState(null); // numéro de la discussion ouverte
  const [contacts, setContacts] = useState({}); // numero -> { nom, photo }
  const [saisie, setSaisie] = useState('');
  const [erreurNouveau, setErreurNouveau] = useState('');
  const [erreurData, setErreurData] = useState('');
  const [modal, setModal] = useState(false);
  const [permNotif, setPermNotif] = useState('denied');

  const ouvertRef = useRef(null);
  ouvertRef.current = ouvert;
  const marquees = useRef(new Set());

  useEffect(() => {
    if (!loading && !profil) router.replace('/');
  }, [loading, profil, router]);

  useEffect(() => {
    if (typeof Notification !== 'undefined') setPermNotif(Notification.permission);
  }, []);

  const notifier = useCallback((m) => {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`Nouveau message de ${m.expediteur}`, { body: String(m.texte).slice(0, 100) });
      }
    } catch { /* certains téléphones refusent new Notification() : on ignore */ }
  }, []);

  // Écoute en temps réel de mes messages (les messages reçus hors-ligne arrivent à la reconnexion)
  useEffect(() => {
    if (!numero) return;
    const q = query(
      collection(db, 'messages'),
      where('participants', 'array-contains', numero),
      orderBy('date', 'desc'),
      limit(1000)
    );
    let premier = true;
    const unsub = onSnapshot(
      q,
      (snap) => {
        setErreurData('');
        setMessages(
          snap.docs
          .map((d) => ({
            id: d.id,
            enAttente: d.metadata.hasPendingWrites,
            ...d.data({ serverTimestamps: 'estimate' }),
          }))
          .filter((m) => !(m.masquePar || []).includes(numero))
        );
        if (!premier) {
          snap.docChanges().forEach((ch) => {
            if (ch.type !== 'added' || ch.doc.metadata.hasPendingWrites) return;
            const m = ch.doc.data();
            const vu = ouvertRef.current === m.expediteur && document.visibilityState === 'visible';
            if (m.destinataire === numero && !vu) notifier(m);
          });
        }
        premier = false;
      },
      () => setErreurData('Impossible de charger vos messages. Vérifiez votre connexion.')
    );
    return unsub;
  }, [numero, notifier]);

  // Présence : met à jour "dernière connexion" toutes les minutes
  useEffect(() => {
    if (!numero) return;
   const ping = () => {
      if (document.visibilityState !== 'visible') return;
      updateDoc(doc(db, 'users', numero), { lastSeen: serverTimestamp() }).catch(() => {});
    };
    ping();
    const t = setInterval(ping, 60000);
    document.addEventListener('visibilitychange', ping);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', ping); };

  }, [numero]);

  // Liste des discussions
  const conversations = useMemo(() => {
    const map = new Map();
    for (const m of messages) {
      const autre = m.expediteur === numero ? m.destinataire : m.expediteur;
      if (!map.has(autre)) map.set(autre, { numero: autre, dernier: m, nonLus: 0 });
      if (m.destinataire === numero && !m.lu) map.get(autre).nonLus += 1;
    }
    if (ouvert && !map.has(ouvert)) map.set(ouvert, { numero: ouvert, dernier: null, nonLus: 0 });
    return [...map.values()].sort(
      (a, b) => (b.dernier ? enMs(b.dernier.date) : Date.now()) - (a.dernier ? enMs(a.dernier.date) : Date.now())
    );
  }, [messages, numero, ouvert]);

  // Charge nom/photo des contacts inconnus
  useEffect(() => {
    const manquants = conversations.map((c) => c.numero).filter((n) => !(n in contacts));
    if (!manquants.length) return;
    manquants.forEach(async (n) => {
      try {
        const s = await getDoc(doc(db, 'users', n));
        setContacts((c) => ({ ...c, [n]: s.exists() ? { nom: s.data().nom, photo: s.data().photo } : { nom: '', photo: '' } }));
      } catch {
        setContacts((c) => ({ ...c, [n]: { nom: '', photo: '' } }));
      }
    });
  }, [conversations, contacts]);

  const messagesOuverts = useMemo(
    () =>
      messages
        .filter((m) => m.expediteur === ouvert || m.destinataire === ouvert)
        .slice()
        .reverse(),
    [messages, ouvert]
  );

  // Marque comme lus les messages de la discussion ouverte
  useEffect(() => {
    if (!ouvert || !numero) return;
    const nonLus = messages.filter(
      (m) => m.expediteur === ouvert && m.destinataire === numero && !m.lu && !m.enAttente && !marquees.current.has(m.id)
    );
    nonLus.slice(0, 200).forEach((m) => {
      marquees.current.add(m.id);
      updateDoc(doc(db, 'messages', m.id), { lu: true }).catch((e) => {
        console.error('Marquer comme lu a échoué :', e.code || e.message);
        setErreurData('Lu impossible(${e.code || e.message})');
        marquees.current.delete(m.id);
      });
    });
  }, [messages, ouvert, numero]);

  async function demarrer(e) {
    e.preventDefault();
    setErreurNouveau('');
    if (!valideNumero(saisie)) return setErreurNouveau('Entrez un numéro à 5 chiffres.');
    if (saisie === numero) return setErreurNouveau("C'est votre propre numéro.");
    try {
      const s = await getDoc(doc(db, 'users', saisie));
      if (!s.exists() || !s.data().actif) return setErreurNouveau("Ce numéro n'existe pas ou n'est pas actif.");
      setContacts((c) => ({ ...c, [saisie]: { nom: s.data().nom, photo: s.data().photo } }));
      setOuvert(saisie);
      setSaisie('');
    } catch {
      setErreurNouveau('Vérification impossible. Réessayez.');
    }
  }

  function envoyer(texte) {
    const t = texte.trim();
    if (!t || !ouvert) return;
    addDoc(collection(db, 'messages'), {
      expediteur: numero,
      destinataire: ouvert,
      texte: t.slice(0, 2000),
      date: serverTimestamp(),
      lu: false,
      participants: [numero, ouvert],
    }).catch(() => setErreurData("Un message n'a pas pu être envoyé (numéro désactivé ?)."));
    // compteur pour les statistiques de l'admin (sans importance si ça échoue)
    updateDoc(doc(db, 'stats', 'global'), { messages: increment(1) }).catch(() => {});
  }
function envoyerMediaMsg(type, data, duree) {
    if (!ouvert) return;
    envoyerMedia(numero, ouvert, type, data, duree).catch((e) => setErreurData(e.message || "L'envoi a échoué."));
    updateDoc(doc(db, 'stats', 'global'), { messages: increment(1) }).catch(() => {});
  }

  // Supprimer un message seulement pour moi
  function supprimerPourMoi(m) {
    updateDoc(doc(db, 'messages', m.id), { masquePar: arrayUnion(numero) })
      .catch(() => setErreurData('Suppression impossible. Réessayez.'));
  }

  // Supprimer un message pour tout le monde (le texte est remplacé, la photo/le vocal est effacé)
  function supprimerPourTous(m) {
    updateDoc(doc(db, 'messages', m.id), { supprime: true, texte: 'Message supprimé' })
      .then(() => { if (m.mediaId) deleteDoc(doc(db, 'medias', m.mediaId)).catch(() => {}); })
      .catch(() => setErreurData('Suppression pour tous impossible (message trop ancien ?).'));
  }

  async function activerNotifs() {
    if (typeof Notification === 'undefined') return;
    setPermNotif(await Notification.requestPermission());
  }

  const filtrees = saisie
    ? conversations.filter((c) => c.numero.includes(saisie) || (contacts[c.numero]?.nom || '').toLowerCase().includes(saisie.toLowerCase()))
    : conversations;

  if (loading || !profil) return <div className="centre">Chargement…</div>;

  if (creerGroupe) return <NouveauGroupe moi={profil.numero} repertoire={repertoire}
  onFermer={() => setCreerGroupe(false)}
  onCree={(g) => { setCreerGroupe(false); setGroupeOuvert(g); }} />;
if (groupeOuvert) return <DiscussionGroupe moi={profil.numero} groupe={groupeOuvert}
  repertoire={repertoire} onFermer={() => setGroupeOuvert(null)} />;

  return (
    <div className={'layout' + (ouvert ? ' avec-chat' : '')}>
      <aside className="sidebar">
        <header className="barre">
          <button className="btn-avatar" onClick={() => setModal(true)} title="Mon profil">
            <Avatar nom={profil.nom} photo={profil.photo} taille={40} />
          </button>
          <div className="moi">
            <strong>{profil.nom}</strong>
            <small>Mon numéro : {profil.numero}</small>
          </div>
          <Link href="/app/compte" className="lien clair">💰 Compte</Link>
          {profil.role === 'admin' && <Link href="/admin" className="lien clair">Admin</Link>}
          <button className="icone" onClick={logout} title="Se déconnecter">⎋</button>
        </header>

        <form className="nouveau" onSubmit={demarrer}>
          <input
            className="champ"
            inputMode="numeric"
            maxLength={5}
            placeholder="Numéro à 5 chiffres…"
            value={saisie}
            onChange={(e) => { setSaisie(e.target.value.replace(/\D/g, '')); setErreurNouveau(''); }}
          />
          <button className="btn primaire petit" disabled={saisie.length !== 5}>Écrire</button>
        </form>
        {erreurNouveau && <p className="erreur marge">{erreurNouveau}</p>}
        {erreurData && <p className="erreur marge">{erreurData}</p>}

        {permNotif === 'default' && (
          <button className="bandeau" onClick={activerNotifs}>🔔 Activer les notifications de nouveaux messages</button>
        )}

        <ul className="liste">
          {filtrees.map((c) => {
            const info = contacts[c.numero] || {};
            return (
              <li key={c.numero}>
                <button className={'item' + (ouvert === c.numero ? ' actif' : '')} onClick={() => setOuvert(c.numero)}>
                  <Avatar nom={info.nom || c.numero} photo={info.photo} />
                  <div className="item-texte">
                    <div className="item-haut">
                      <strong>{info.nom ? `${info.nom}` : c.numero}</strong>
                      {c.dernier && <small className={c.nonLus ? 'vert' : ''}>{dateCourte(c.dernier.date)}</small>}
                    </div>
                    <div className="item-bas">
                      <span className="apercu">
                        {c.dernier ? (c.dernier.expediteur === numero ? 'Vous : ' : '') + c.dernier.texte : 'Nouvelle discussion'}
                      </span>
                      {c.nonLus > 0 && <span className="pastille">{c.nonLus}</span>}
                    </div>
                    {info.nom && <small className="num-petit">{c.numero}</small>}
                  </div>
                </button>
              </li>
            );
          })}
          {!filtrees.length && (
            <li className="vide-liste">
              {conversations.length
                ? 'Aucune discussion ne correspond.'
                : 'Aucune discussion. Tapez un numéro à 5 chiffres ci-dessus pour écrire à quelqu\'un.'}
            </li>
          )}
        </ul>
      </aside>

      <main className="conv">
        {ouvert ? (
          <Conversation
            key={ouvert}
            moi={numero}
            autre={ouvert}
            contact={contacts[ouvert] || {}}
            messages={messagesOuverts}
            onRetour={() => setOuvert(null)}
            onEnvoyer={envoyer}
            onEnvoyerMedia={envoyerMediaMsg}
            onSupprimerMoi={supprimerPourMoi}
            onSupprimerTous={supprimerPourTous}

          />
        ) : (
          <div className="vide">
            <div className="logo">💬</div>
            <h2>Mini-WhatsApp</h2>
            <p>Messages 100 % gratuits. Choisissez une discussion ou tapez un numéro à 5 chiffres.</p>
          </div>
        )}
      </main>

      {modal && (
        <ProfilModal
          profil={profil}
          onClose={() => setModal(false)}
          onSaved={(p) => setProfil({ ...profil, ...p })}
        />
      )}
    </div>
  );
}
function Conversation({ moi, autre, contact, messages, onRetour, onEnvoyer, onEnvoyerMedia, onSupprimerMoi, onSupprimerTous }) {
  const bas = useRef(null);
  const [menu, setMenu] = useState(null); // message dont on affiche le menu de suppression
  const [vu, setVu] = useState(null);
  const [, setTic] = useState(0);

  useEffect(() => {
    bas.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // Présence de l'autre personne : en ligne / dernière connexion
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'users', autre),
      (s) => setVu(s.exists() ? s.data({ serverTimestamps: 'estimate' }).lastSeen || null : null),
      () => {}
    );
    const t = setInterval(() => setTic((n) => n + 1), 30000);
    return () => { unsub(); clearInterval(t); };
  }, [autre]);
  const etat = presence(vu);

  let jourPrecedent = '';
  return (
    <>
      <header className="barre">
        <button className="icone retour" onClick={onRetour} aria-label="Retour">←</button>
        <Avatar nom={contact.nom || autre} photo={contact.photo} taille={40} />
        <div className="moi">
          <strong>{contact.nom || autre}</strong>
          <small>Numéro {autre}</small>
          {etat && <small className={etat === 'en ligne' ? 'en-ligne' : ''}>{etat}</small>}
        </div>
      </header>

      <div className="fil">
        {messages.map((m) => {
          const jour = dateLongue(m.date);
          const sep = jour !== jourPrecedent;
          jourPrecedent = jour;
          const miens = m.expediteur === moi;
          return (
            <div key={m.id}>
              {sep && <div className="jour"><span>{jour}</span></div>}
              <div className={'bulle ' + (miens ? 'moi' : 'autre')}>
                <ContenuMessage m={m} onChargee={() => bas.current?.scrollIntoView({ block: 'end' })} />
                <span className="meta">
                  {!m.enAttente && (
                    <button type="button" className="plus" title="Supprimer" onClick={() => setMenu(m)}>⋮</button>
                  )}
                  {heure(m.date)}
                  {miens && (
                    <span className={'coches' + (m.lu ? ' lu' : '')}>
                      {m.enAttente ? ' 🕓' : m.lu ? ' ✓✓' : ' ✓'}
                    </span>
                  )}
                </span>
              </div>
            </div>
          );
        })}
        {!messages.length && <p className="vide-fil">Écrivez votre premier message à {autre}.</p>}
        <div ref={bas} />
      </div>

      <BarreSaisie onTexte={onEnvoyer} onMedia={onEnvoyerMedia} />

      {menu && (
        <div className="fond" onClick={() => setMenu(null)}>
          <div className="carte modal" onClick={(e) => e.stopPropagation()}>
            <h2>Supprimer le message ?</h2>
            <div className="choix-suppr">
              <button className="btn" onClick={() => { onSupprimerMoi(menu); setMenu(null); }}>
                Supprimer pour moi
              </button>
              {menu.expediteur === moi && !menu.supprime && Date.now() - enMs(menu.date) < 2 * 86400000 && (
                <button className="btn danger" onClick={() => { onSupprimerTous(menu); setMenu(null); }}>
                  Supprimer pour tous
                </button>
              )}
              <button className="btn" onClick={() => setMenu(null)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProfilModal({ profil, onClose, onSaved }) {
  const [nom, setNom] = useState(profil.nom || '');
  const [photo, setPhoto] = useState(profil.photo || '');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');

  async function choisirPhoto(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setPhoto(await redimensionnerImage(f));
    } catch {
      setErreur('Image illisible.');
    }
  }

  async function enregistrer(e) {
    e.preventDefault();
    const n = nom.trim().slice(0, 40);
    if (!n) return setErreur('Le nom ne peut pas être vide.');
    setOccupe(true);
    try {
      await updateDoc(doc(db, 'users', profil.numero), { nom: n, photo });
      onSaved({ nom: n, photo });
      onClose();
    } catch {
      setErreur("Enregistrement impossible.");
      setOccupe(false);
    }
  }

  return (
    <div className="fond" onClick={onClose}>
      <form className="carte modal" onClick={(e) => e.stopPropagation()} onSubmit={enregistrer}>
        <h2>Mon profil</h2>
        <div className="centrer"><Avatar nom={nom} photo={photo} taille={96} /></div>
        <label className="btn petit centrer-btn">
          Changer la photo
          <input type="file" accept="image/*" hidden onChange={choisirPhoto} />
        </label>
        {photo && <button type="button" className="btn petit" onClick={() => setPhoto('')}>Retirer la photo</button>}

        <label>Nom affiché</label>
        <input className="champ" maxLength={40} value={nom} onChange={(e) => setNom(e.target.value)} />

        <label>Mon numéro (non modifiable)</label>
        <input className="champ" value={profil.numero} disabled />

        {erreur && <p className="erreur">{erreur}</p>}
        <div className="ligne">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primaire" disabled={occupe}>{occupe ? '…' : 'Enregistrer'}</button>
        </div>
      </form>
    </div>
  );
}
