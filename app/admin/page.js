'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  collection, doc, getDoc, setDoc, addDoc, updateDoc, writeBatch,
  onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { valideNumero, dateHeure, enMs } from '@/lib/utils';

export default function PageAdmin() {
  const { profil, loading, logout } = useAuth();
  const router = useRouter();
  const [onglet, setOnglet] = useState('utilisateurs');
  const [users, setUsers] = useState([]);
  const [emails, setEmails] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [nbMessages, setNbMessages] = useState(0);
  const [erreurData, setErreurData] = useState('');

  // Garde d'accès : réservé au rôle admin
  useEffect(() => {
    if (loading) return;
    if (!profil) router.replace('/');
    else if (profil.role !== 'admin') router.replace('/app');
  }, [loading, profil, router]);

  const estAdmin = profil?.role === 'admin';

  useEffect(() => {
    if (!estAdmin) return;
    const onErr = () => setErreurData("Impossible de charger les données (règles de sécurité ?).");
    const u1 = onSnapshot(collection(db, 'users'), (s) => setUsers(s.docs.map((d) => d.data())), onErr);
    const u2 = onSnapshot(collection(db, 'emails'), (s) => setEmails(s.docs.map((d) => d.data())), onErr);
    const u3 = onSnapshot(
      query(collection(db, 'paiements'), orderBy('date', 'desc')),
      (s) => setPaiements(s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))),
      onErr
    );
    const refStats = doc(db, 'stats', 'global');
    const u4 = onSnapshot(refStats, (s) => {
      if (!s.exists()) setDoc(refStats, { messages: 0 }).catch(() => {});
      else setNbMessages(s.data().messages || 0);
    }, onErr);
    return () => { u1(); u2(); u3(); u4(); };
  }, [estAdmin]);

  const emailParNumero = useMemo(() => {
    const m = {};
    emails.forEach((e) => { m[e.numero] = e.email; });
    return m;
  }, [emails]);

  if (loading || !estAdmin) return <div className="centre">Chargement…</div>;

  const il24h = Date.now() - 86400000;
  const actifs24h = users.filter((u) => u.lastSeen && enMs(u.lastSeen) > il24h).length;
  const bloques = users.filter((u) => !u.actif).length;
  const totalPaye = paiements.reduce((t, p) => t + (Number(p.montant) || 0), 0);

  return (
    <div className="admin">
      <header className="admin-barre">
        <div>
          <strong>Administration</strong>
          <small> — {profil.nom} ({profil.numero})</small>
        </div>
        <div className="admin-actions">
           <Link href="/admin/comptes" className="lien">comptes &amp; soldes</Link>
          <Link href="/app" className="lien">Ma messagerie</Link>
          <button className="btn petit" onClick={logout}>Déconnexion</button>
        </div>
      </header>

      {erreurData && <p className="erreur">{erreurData}</p>}

      <section className="stats">
        <Stat titre="Utilisateurs" valeur={users.length} />
        <Stat titre="Actifs (24 h)" valeur={actifs24h} />
        <Stat titre="Désactivés / bloqués" valeur={bloques} />
        <Stat titre="Messages envoyés" valeur={nbMessages} />
      </section>

      <nav className="onglets">
        <button className={onglet === 'utilisateurs' ? 'actif' : ''} onClick={() => setOnglet('utilisateurs')}>
          Numéros &amp; utilisateurs
        </button>
        <button className={onglet === 'paiements' ? 'actif' : ''} onClick={() => setOnglet('paiements')}>
          Paiements ({totalPaye.toLocaleString('fr-FR')} FCFA)
        </button>
      </nav>

      {onglet === 'utilisateurs' && (
        <Utilisateurs users={users} emailParNumero={emailParNumero} moi={profil.numero} />
      )}
      {onglet === 'paiements' && <Paiements paiements={paiements} users={users} />}
    </div>
  );
}

function Stat({ titre, valeur }) {
  return (
    <div className="stat">
      <div className="stat-val">{valeur}</div>
      <div className="stat-titre">{titre}</div>
    </div>
  );
}

/* ---------------------------- Utilisateurs ---------------------------- */

function Utilisateurs({ users, emailParNumero, moi }) {
  const [email, setEmail] = useState('');
  const [numero, setNumero] = useState('');
  const [nom, setNom] = useState('');
  const [role, setRole] = useState('user');
  const [msg, setMsg] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [filtre, setFiltre] = useState('');

  async function numeroLibre() {
    for (let i = 0; i < 25; i++) {
      const n = String(Math.floor(10000 + Math.random() * 90000));
      const s = await getDoc(doc(db, 'users', n));
      if (!s.exists()) return n;
    }
    return '';
  }

  async function generer() {
    setNumero(await numeroLibre());
  }

  async function creer(e) {
    e.preventDefault();
    setMsg(null);
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@gmail\.com$/.test(mail)) {
      return setMsg({ type: 'erreur', texte: 'Entrez une adresse Gmail valide (exemple@gmail.com).' });
    }
    if (!valideNumero(numero)) {
      return setMsg({ type: 'erreur', texte: 'Le numéro doit avoir 5 chiffres (10000 à 99999).' });
    }
    setOccupe(true);
    try {
      const [a, b] = await Promise.all([
        getDoc(doc(db, 'users', numero)),
        getDoc(doc(db, 'emails', mail)),
      ]);
      if (a.exists()) throw new Error(`Le numéro ${numero} est déjà utilisé.`);
      if (b.exists()) throw new Error(`Ce Gmail a déjà le numéro ${b.data().numero}.`);

      const batch = writeBatch(db);
      batch.set(doc(db, 'users', numero), {
        numero,
        nom: nom.trim().slice(0, 40) || `Utilisateur ${numero}`,
        photo: '',
        role,
        actif: true,
        statut: 'actif',
        createdAt: serverTimestamp(),
        lastSeen: null,
      });
      batch.set(doc(db, 'emails', mail), { email: mail, numero, createdAt: serverTimestamp() });
      await batch.commit();

      setMsg({ type: 'ok', texte: `Numéro ${numero} créé pour ${mail}.` });
      setEmail(''); setNumero(''); setNom(''); setRole('user');
    } catch (err) {
      setMsg({ type: 'erreur', texte: err.message || 'Création impossible.' });
    }
    setOccupe(false);
  }

  async function changerStatut(u, statut) {
    if (u.numero === moi && statut !== 'actif') {
      return alert('Vous ne pouvez pas vous désactiver vous-même.');
    }
    await updateDoc(doc(db, 'users', u.numero), { statut, actif: statut === 'actif' });
  }

  async function supprimer(u) {
    if (u.numero === moi) return alert('Vous ne pouvez pas supprimer votre propre compte.');
    if (!confirm(`Supprimer définitivement le numéro ${u.numero} (${emailParNumero[u.numero] || ''}) ?`)) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', u.numero));
    const mail = emailParNumero[u.numero];
    if (mail) batch.delete(doc(db, 'emails', mail));
    await batch.commit();
  }

  const liste = users
    .filter((u) => {
      const q = filtre.trim().toLowerCase();
      if (!q) return true;
      return (
        u.numero.includes(q) ||
        (u.nom || '').toLowerCase().includes(q) ||
        (emailParNumero[u.numero] || '').includes(q)
      );
    })
    .sort((a, b) => enMs(b.createdAt) - enMs(a.createdAt));

  return (
    <>
      <form className="carte large" onSubmit={creer}>
        <h2>Créer un numéro</h2>
        <div className="grille">
          <div>
            <label>Gmail de l&apos;utilisateur</label>
            <input className="champ" type="email" placeholder="exemple@gmail.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label>Numéro (5 chiffres)</label>
            <div className="ligne">
              <input className="champ" inputMode="numeric" maxLength={5} placeholder="12345"
                value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))} />
              <button type="button" className="btn petit" onClick={generer}>Au hasard</button>
            </div>
          </div>
          <div>
            <label>Nom (facultatif)</label>
            <input className="champ" maxLength={40} value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div>
            <label>Rôle</label>
            <select className="champ" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">Utilisateur</option>
              <option value="agent">agent(Retraits)</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>
        </div>
        <button className="btn primaire" disabled={occupe}>{occupe ? 'Création…' : 'Créer le numéro'}</button>
        {msg && <p className={msg.type === 'ok' ? 'succes' : 'erreur'}>{msg.texte}</p>}
      </form>

      <div className="carte large">
        <div className="ligne entre">
          <h2>Utilisateurs ({users.length})</h2>
          <input className="champ recherche" placeholder="Rechercher (numéro, nom, Gmail)"
            value={filtre} onChange={(e) => setFiltre(e.target.value)} />
        </div>
        <div className="tableau-wrap">
          <table className="tableau">
            <thead>
              <tr><th>Numéro</th><th>Gmail</th><th>Nom</th><th>Rôle</th><th>Statut</th><th>Créé le</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {liste.map((u) => (
                <tr key={u.numero}>
                  <td><strong>{u.numero}</strong></td>
                  <td>{emailParNumero[u.numero] || '—'}</td>
                  <td>{u.nom}</td>
                  <td>{u.role === 'admin' ? 'Admin' : u.role ==='agent' ? 'Agent' :'utilisateur'}</td>
                  <td><span className={'badge ' + (u.statut || (u.actif ? 'actif' : 'desactive'))}>
                    {u.statut === 'bloque' ? 'Bloqué' : u.actif ? 'Actif' : 'Désactivé'}
                  </span></td>
                  <td>{dateHeure(u.createdAt)}</td>
                  <td className="actions">
                    {!u.actif && <button className="btn petit" onClick={() => changerStatut(u, 'actif')}>Activer</button>}
                    {u.actif && <button className="btn petit" onClick={() => changerStatut(u, 'desactive')}>Désactiver</button>}
                    {u.statut !== 'bloque' && <button className="btn petit danger" onClick={() => changerStatut(u, 'bloque')}>Bloquer</button>}
                    <button className="btn petit danger" onClick={() => supprimer(u)}>Supprimer</button>
                  </td>
                </tr>
              ))}
              {!liste.length && <tr><td colSpan={7} className="vide-tab">Aucun utilisateur.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ----------------------------- Paiements ----------------------------- */

function Paiements({ paiements, users }) {
  const [numero, setNumero] = useState('');
  const [montant, setMontant] = useState('');
  const [moyen, setMoyen] = useState('Orange Money');
  const [reference, setReference] = useState('');
  const [msg, setMsg] = useState(null);

  async function ajouter(e) {
    e.preventDefault();
    setMsg(null);
    if (!users.find((u) => u.numero === numero)) return setMsg('Ce numéro n\'existe pas.');
    if (!(Number(montant) > 0)) return setMsg('Montant invalide.');
    await addDoc(collection(db, 'paiements'), {
      numero, montant: Number(montant), moyen, reference: reference.trim(), date: serverTimestamp(),
    });
    setNumero(''); setMontant(''); setReference('');
  }

  return (
    <>
      <form className="carte large" onSubmit={ajouter}>
        <h2>Enregistrer un paiement</h2>
        <p className="aide">Pour l&apos;instant les paiements (Orange Money, Moov Money, espèces) sont notés à la main. Le paiement automatique viendra en phase 2.</p>
        <div className="grille">
          <div><label>Numéro</label>
            <input className="champ" inputMode="numeric" maxLength={5} value={numero}
              onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))} /></div>
          <div><label>Montant (FCFA)</label>
            <input className="champ" inputMode="numeric" value={montant}
              onChange={(e) => setMontant(e.target.value.replace(/\D/g, ''))} /></div>
          <div><label>Moyen</label>
            <select className="champ" value={moyen} onChange={(e) => setMoyen(e.target.value)}>
              <option>Orange Money</option><option>Moov Money</option><option>Espèces</option><option>Autre</option>
            </select></div>
          <div><label>Référence / note</label>
            <input className="champ" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        </div>
        <button className="btn primaire">Enregistrer</button>
        {msg && <p className="erreur">{msg}</p>}
      </form>

      <div className="carte large">
        <h2>Historique</h2>
        <div className="tableau-wrap">
          <table className="tableau">
            <thead><tr><th>Date</th><th>Numéro</th><th>Montant</th><th>Moyen</th><th>Référence</th></tr></thead>
            <tbody>
              {paiements.map((p) => (
                <tr key={p.id}>
                  <td>{dateHeure(p.date)}</td><td>{p.numero}</td>
                  <td>{Number(p.montant).toLocaleString('fr-FR')} FCFA</td>
                  <td>{p.moyen}</td><td>{p.reference || '—'}</td>
                </tr>
              ))}
              {!paiements.length && <tr><td colSpan={5} className="vide-tab">Aucun paiement.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
