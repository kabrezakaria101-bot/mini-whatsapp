'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { valideNumero, dateHeure } from '@/lib/utils';
import { deposer, debiter, fcfa } from '@/lib/comptes';

const NOMS = {
  transfert: 'Transfert', retrait: 'Retrait agent', depot: 'Dépôt',
  debit_admin: 'Débit admin', coffre_depot: 'Coffre (entrée)', coffre_retrait: 'Coffre (sortie)',
};

export default function PageComptesAdmin() {
  const { profil, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [soldes, setSoldes] = useState({});
  const [txs, setTxs] = useState([]);
  const [action, setAction] = useState('depot');
  const [numero, setNumero] = useState('');
  const [montant, setMontant] = useState('');
  const [msg, setMsg] = useState(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!profil) router.replace('/');
    else if (profil.role !== 'admin') router.replace('/app');
  }, [loading, profil, router]);

  const estAdmin = profil?.role === 'admin';

  useEffect(() => {
    if (!estAdmin) return;
    const u1 = onSnapshot(collection(db, 'users'), (s) => setUsers(s.docs.map((d) => d.data())));
    const u2 = onSnapshot(collection(db, 'comptes'), (s) => {
      const m = {};
      s.docs.forEach((d) => { m[d.id] = d.data().solde || 0; });
      setSoldes(m);
    });
    const u3 = onSnapshot(
      query(collection(db, 'transactions'), orderBy('date', 'desc'), limit(50)),
      (s) => setTxs(s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })))
    );
    return () => { u1(); u2(); u3(); };
  }, [estAdmin]);

  const total = useMemo(() => Object.values(soldes).reduce((t, n) => t + n, 0), [soldes]);

  if (loading || !estAdmin) return <div className="centre">Chargement…</div>;

  async function valider(e) {
    e.preventDefault();
    setMsg(null);
    const m = Number(montant);
    const cible = users.find((u) => u.numero === numero);
    if (!valideNumero(numero) || !cible) return setMsg({ type: 'erreur', texte: "Ce numéro n'existe pas." });
    if (action === 'debit' && m > (soldes[numero] || 0)) return setMsg({ type: 'erreur', texte: 'Solde insuffisant sur ce compte.' });
    const verbe = action === 'depot' ? 'Créditer' : 'Débiter';
    if (!confirm(`${verbe} ${fcfa(m)} sur le compte de ${cible.nom} (${numero}) ?`)) return;
    setOccupe(true);
    try {
      if (action === 'depot') await deposer(profil.numero, numero, m);
      else await debiter(profil.numero, numero, m);
      setMsg({ type: 'ok', texte: `${verbe === 'Créditer' ? 'Crédit' : 'Débit'} de ${fcfa(m)} effectué pour ${numero}.` });
      setNumero(''); setMontant('');
    } catch (err) {
      setMsg({ type: 'erreur', texte: err.message });
    }
    setOccupe(false);
  }

  return (
    <div className="admin">
      <header className="admin-barre">
        <div><strong>Comptes &amp; soldes</strong></div>
        <Link href="/admin" className="lien">← Administration</Link>
      </header>

      <section className="stats">
        <div className="stat"><div className="stat-val">{fcfa(total)}</div><div className="stat-titre">Total des soldes (hors coffres)</div></div>
        <div className="stat"><div className="stat-val">{users.filter((u) => u.role === 'agent').length}</div><div className="stat-titre">Agents</div></div>
      </section>

      <form className="carte large" onSubmit={valider}>
        <h2>Créditer / débiter un compte</h2>
        <p className="aide">
          <strong>Dépôt</strong> : un client vous remet des espèces, vous créditez son compte.
          <br /><strong>Débit</strong> : vous remettez des espèces à un agent (ou corrigez une erreur), vous débitez son compte.
        </p>
        <div className="grille">
          <div><label>Opération</label>
            <select className="champ" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="depot">Dépôt (créditer)</option>
              <option value="debit">Retrait / correction (débiter)</option>
            </select></div>
          <div><label>Numéro</label>
            <input className="champ" inputMode="numeric" maxLength={5} value={numero}
              onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))} /></div>
          <div><label>Montant (FCFA)</label>
            <input className="champ" inputMode="numeric" value={montant}
              onChange={(e) => setMontant(e.target.value.replace(/\D/g, ''))} /></div>
        </div>
        <button className="btn primaire" disabled={occupe || !numero || !montant}>{occupe ? '…' : 'Valider'}</button>
        {msg && <p className={msg.type === 'ok' ? 'succes' : 'erreur'}>{msg.texte}</p>}
      </form>

      <div className="carte large">
        <h2>Soldes</h2>
        <div className="tableau-wrap">
          <table className="tableau">
            <thead><tr><th>Numéro</th><th>Nom</th><th>Rôle</th><th>Solde</th></tr></thead>
            <tbody>
              {users.slice().sort((a, b) => (soldes[b.numero] || 0) - (soldes[a.numero] || 0)).map((u) => (
                <tr key={u.numero}>
                  <td><strong>{u.numero}</strong></td><td>{u.nom}</td>
                  <td>{u.role === 'admin' ? 'Admin' : u.role === 'agent' ? 'Agent' : 'Utilisateur'}</td>
                  <td>{fcfa(soldes[u.numero] || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="carte large">
        <h2>50 dernières opérations</h2>
        <div className="tableau-wrap">
          <table className="tableau">
            <thead><tr><th>Date</th><th>Type</th><th>De</th><th>Vers</th><th>Montant</th><th>Frais</th></tr></thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id}>
                  <td>{dateHeure(t.date)}</td><td>{NOMS[t.type] || t.type}</td>
                  <td>{t.expediteur}</td><td>{t.destinataire}</td>
                  <td>{fcfa(t.montant)}</td><td>{t.frais ? fcfa(t.frais) : '—'}</td>
                </tr>
              ))}
              {!txs.length && <tr><td colSpan={6} className="vide-tab">Aucune opération.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
