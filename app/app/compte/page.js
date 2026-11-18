'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  collection, doc, getDoc, onSnapshot, query, where, orderBy, limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { valideNumero, dateHeure, enMs } from '@/lib/utils';
import {
  transferer, retirer, mettreAuCoffre, libererCoffre, calculFrais, fcfa, TAUX_RETRAIT,
} from '@/lib/comptes';

function libelle(t, moi) {
  const recu = t.destinataire === moi && t.expediteur !== moi;
  switch (t.type) {
    case 'transfert':
      return t.expediteur === moi
        ? { texte: `Envoyé à ${t.destinataire}`, signe: -1, total: t.montant }
        : { texte: `Reçu de ${t.expediteur}`, signe: 1, total: t.montant };
    case 'retrait':
      return t.expediteur === moi
        ? { texte: `Retrait chez l'agent ${t.destinataire} (frais ${fcfa(t.frais)})`, signe: -1, total: t.montant + t.frais }
        : { texte: `Retrait du client ${t.expediteur} (commission ${fcfa(t.frais)})`, signe: 1, total: t.montant + t.frais };
    case 'depot':
      return { texte: 'Dépôt (administrateur)', signe: 1, total: t.montant };
    case 'debit_admin':
      return { texte: 'Débit (administrateur)', signe: -1, total: t.montant };
    case 'coffre_depot':
      return { texte: 'Mis au coffre-fort', signe: -1, total: t.montant };
    case 'coffre_retrait':
      return { texte: 'Sorti du coffre-fort', signe: 1, total: t.montant };
    default:
      return { texte: t.type, signe: recu ? 1 : -1, total: t.montant };
  }
}

export default function PageCompte() {
  const { profil, loading } = useAuth();
  const router = useRouter();
  const numero = profil?.numero;

  const [onglet, setOnglet] = useState('solde');
  const [solde, setSolde] = useState(0);
  const [coffres, setCoffres] = useState([]);
  const [historique, setHistorique] = useState([]);
  const [erreurData, setErreurData] = useState('');

  useEffect(() => {
    if (!loading && !profil) router.replace('/');
  }, [loading, profil, router]);

  useEffect(() => {
    if (!numero) return;
    const onErr = (nom) => (e) => {
      console.error(nom, e);
      setErreurData(`Lecture refusée : ${nom} (${e.code || e.message})`);
    };
    const u1 = onSnapshot(doc(db, 'comptes', numero), (s) => setSolde(s.exists() ? s.data().solde || 0 : 0), onErr('solde'));
    const u2 = onSnapshot(collection(db, 'comptes', numero, 'coffres'), (s) =>
      setCoffres(s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))), onErr('coffres'));
    const u3 = onSnapshot(
      query(collection(db, 'transactions'), where('participants', 'array-contains', numero)),
      (s) => {
        setErreurData('');
        setHistorique(
          s.docs
            .map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))
            .sort((a, b) => enMs(b.date) - enMs(a.date))
            .slice(0, 50)
        );
      },
      onErr('historique')
    );
    return () => { u1(); u2(); u3(); };
  }, [numero]);


  if (loading || !profil) return <div className="centre">Chargement…</div>;

  const dansCoffres = coffres.filter((c) => !c.libere).reduce((t, c) => t + c.montant, 0);

  return (
    <div className="admin">
      <header className="admin-barre">
        <div>
          <strong>Mon compte</strong>
          <small> — {profil.nom} ({numero}){profil.role === 'agent' ? ' · Agent' : ''}</small>
        </div>
        <Link href="/app" className="lien">← Messagerie</Link>
      </header>

      {erreurData && <p className="erreur">{erreurData}</p>}

      <section className="stats">
        <div className="stat">
          <div className="stat-val">{fcfa(solde)}</div>
          <div className="stat-titre">Solde disponible</div>
        </div>
        <div className="stat">
          <div className="stat-val">{fcfa(dansCoffres)}</div>
          <div className="stat-titre">Dans le coffre-fort</div>
        </div>
      </section>

      <nav className="onglets">
        {[['solde', 'Solde'], ['transfert', 'Transfert'], ['retrait', 'Retrait'], ['coffre', 'Coffre-fort']].map(([id, nom]) => (
          <button key={id} className={onglet === id ? 'actif' : ''} onClick={() => setOnglet(id)}>{nom}</button>
        ))}
      </nav>

      {onglet === 'solde' && <Historique liste={historique} moi={numero} />}
      {onglet === 'transfert' && <Transfert moi={numero} solde={solde} />}
      {onglet === 'retrait' && <Retrait moi={numero} solde={solde} />}
      {onglet === 'coffre' && <Coffre moi={numero} solde={solde} coffres={coffres} />}
    </div>
  );
}

function Message({ m }) {
  if (!m) return null;
  return <p className={m.type === 'ok' ? 'succes' : 'erreur'}>{m.texte}</p>;
}

function Historique({ liste, moi }) {
  return (
    <div className="carte large">
      <h2>Dernières opérations</h2>
      <div className="tableau-wrap">
        <table className="tableau">
          <thead><tr><th>Date</th><th>Opération</th><th>Montant</th></tr></thead>
          <tbody>
            {liste.map((t) => {
              const l = libelle(t, moi);
              return (
                <tr key={t.id}>
                  <td>{dateHeure(t.date)}</td>
                  <td>{l.texte}</td>
                  <td style={{ color: l.signe > 0 ? '#1b6e3a' : '#c62828', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {l.signe > 0 ? '+' : '−'} {fcfa(l.total)}
                  </td>
                </tr>
              );
            })}
            {!liste.length && <tr><td colSpan={3} className="vide-tab">Aucune opération.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Transfert({ moi, solde }) {
  const [dest, setDest] = useState('');
  const [montant, setMontant] = useState('');
  const [msg, setMsg] = useState(null);
  const [occupe, setOccupe] = useState(false);

  async function envoyer(e) {
    e.preventDefault();
    setMsg(null);
    const m = Number(montant);
    if (!valideNumero(dest)) return setMsg({ type: 'erreur', texte: 'Entrez un numéro à 5 chiffres.' });
    if (dest === moi) return setMsg({ type: 'erreur', texte: "C'est votre propre numéro." });
    if (m > solde) return setMsg({ type: 'erreur', texte: 'Solde insuffisant.' });
    setOccupe(true);
    try {
      const s = await getDoc(doc(db, 'users', dest));
      if (!s.exists() || !s.data().actif) throw new Error("Ce numéro n'existe pas ou n'est pas actif.");
      if (!confirm(`Envoyer ${fcfa(m)} à ${s.data().nom} (${dest}) ?`)) { setOccupe(false); return; }
      await transferer(moi, dest, m);
      setMsg({ type: 'ok', texte: `${fcfa(m)} envoyés à ${dest}.` });
      setDest(''); setMontant('');
    } catch (err) {
      setMsg({ type: 'erreur', texte: err.message });
    }
    setOccupe(false);
  }

  return (
    <form className="carte large" onSubmit={envoyer}>
      <h2>Envoyer de l&apos;argent</h2>
      <p className="aide">Envoi direct, gratuit et instantané vers un autre numéro.</p>
      <div className="grille">
        <div><label>Numéro du destinataire</label>
          <input className="champ" inputMode="numeric" maxLength={5} value={dest}
            onChange={(e) => setDest(e.target.value.replace(/\D/g, ''))} /></div>
        <div><label>Montant (FCFA)</label>
          <input className="champ" inputMode="numeric" value={montant}
            onChange={(e) => setMontant(e.target.value.replace(/\D/g, ''))} /></div>
      </div>
      <button className="btn primaire" disabled={occupe || !dest || !montant}>{occupe ? '…' : 'Envoyer'}</button>
      <Message m={msg} />
    </form>
  );
}

function Retrait({ moi, solde }) {
  const [agent, setAgent] = useState('');
  const [montant, setMontant] = useState('');
  const [msg, setMsg] = useState(null);
  const [occupe, setOccupe] = useState(false);

  const m = Number(montant) || 0;
  const frais = m ? calculFrais(m) : 0;

  async function retrait(e) {
    e.preventDefault();
    setMsg(null);
    if (!valideNumero(agent)) return setMsg({ type: 'erreur', texte: "Entrez le numéro à 5 chiffres de l'agent." });
    if (agent === moi) return setMsg({ type: 'erreur', texte: "C'est votre propre numéro." });
    if (m + frais > solde) return setMsg({ type: 'erreur', texte: `Solde insuffisant : il faut ${fcfa(m + frais)}.` });
    setOccupe(true);
    try {
      const s = await getDoc(doc(db, 'users', agent));
      if (!s.exists() || !s.data().actif || s.data().role !== 'agent') {
        throw new Error("Ce numéro n'est pas celui d'un agent actif.");
      }
      if (!confirm(`Retirer ${fcfa(m)} en espèces chez ${s.data().nom} (${agent}) ?\nVotre compte sera débité de ${fcfa(m + frais)} (frais ${fcfa(frais)}).`)) {
        setOccupe(false); return;
      }
      await retirer(moi, agent, m);
      setMsg({ type: 'ok', texte: `Retrait enregistré. L'agent doit vous remettre ${fcfa(m)} en espèces.` });
      setAgent(''); setMontant('');
    } catch (err) {
      setMsg({ type: 'erreur', texte: err.message });
    }
    setOccupe(false);
  }

  return (
    <form className="carte large" onSubmit={retrait}>
      <h2>Retirer de l&apos;argent chez un agent</h2>
      <p className="aide">
        Les retraits se font uniquement chez un agent agréé. Frais : {TAUX_RETRAIT} % du montant retiré
        (par exemple 300 FCFA pour 10 000 FCFA). Faites l&apos;opération devant l&apos;agent : il vous remet
        les espèces après que vous avez validé.
      </p>
      <div className="grille">
        <div><label>Numéro de l&apos;agent</label>
          <input className="champ" inputMode="numeric" maxLength={5} value={agent}
            onChange={(e) => setAgent(e.target.value.replace(/\D/g, ''))} /></div>
        <div><label>Montant à recevoir en espèces (FCFA)</label>
          <input className="champ" inputMode="numeric" value={montant}
            onChange={(e) => setMontant(e.target.value.replace(/\D/g, ''))} /></div>
      </div>
      {m > 0 && (
        <p className="aide">Frais : <strong>{fcfa(frais)}</strong> · Total débité : <strong>{fcfa(m + frais)}</strong></p>
      )}
      <button className="btn primaire" disabled={occupe || !agent || !montant}>{occupe ? '…' : 'Valider le retrait'}</button>
      <Message m={msg} />
    </form>
  );
}

function Coffre({ moi, solde, coffres }) {
  const [montant, setMontant] = useState('');
  const [date, setDate] = useState('');
  const [msg, setMsg] = useState(null);
  const [occupe, setOccupe] = useState(false);

  const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  async function ajouter(e) {
    e.preventDefault();
    setMsg(null);
    const m = Number(montant);
    if (m > solde) return setMsg({ type: 'erreur', texte: 'Solde insuffisant.' });
    if (!date) return setMsg({ type: 'erreur', texte: 'Choisissez la date de retrait.' });
    // disponible à partir de 00h00 du jour choisi
    const d = new Date(`${date}T00:00:00`);
    if (!confirm(`Bloquer ${fcfa(m)} jusqu'au ${d.toLocaleDateString('fr-FR')} ? Impossible de les retirer avant.`)) return;
    setOccupe(true);
    try {
      await mettreAuCoffre(moi, m, d);
      setMsg({ type: 'ok', texte: `${fcfa(m)} mis au coffre.` });
      setMontant(''); setDate('');
    } catch (err) {
      setMsg({ type: 'erreur', texte: err.message });
    }
    setOccupe(false);
  }

  async function sortir(c) {
    setMsg(null);
    try {
      await libererCoffre(moi, c);
      setMsg({ type: 'ok', texte: `${fcfa(c.montant)} remis sur votre solde.` });
    } catch (err) {
      setMsg({ type: 'erreur', texte: err.message });
    }
  }

  const liste = coffres.slice().sort((a, b) => enMs(a.dispo) - enMs(b.dispo));

  return (
    <>
      <form className="carte large" onSubmit={ajouter}>
        <h2>Mettre de l&apos;argent au coffre-fort</h2>
        <p className="aide">L&apos;argent est bloqué jusqu&apos;à la date choisie. Avant cette date, il est impossible de le retirer.</p>
        <div className="grille">
          <div><label>Montant (FCFA)</label>
            <input className="champ" inputMode="numeric" value={montant}
              onChange={(e) => setMontant(e.target.value.replace(/\D/g, ''))} /></div>
          <div><label>Disponible à partir du</label>
            <input className="champ" type="date" min={demain} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <button className="btn primaire" disabled={occupe || !montant || !date}>{occupe ? '…' : 'Bloquer au coffre'}</button>
        <Message m={msg} />
      </form>

      <div className="carte large">
        <h2>Mes coffres</h2>
        <div className="tableau-wrap">
          <table className="tableau">
            <thead><tr><th>Montant</th><th>Disponible le</th><th>État</th></tr></thead>
            <tbody>
              {liste.map((c) => {
                const pret = Date.now() >= enMs(c.dispo);
                return (
                  <tr key={c.id}>
                    <td><strong>{fcfa(c.montant)}</strong></td>
                    <td>{dateHeure(c.dispo)}</td>
                    <td>
                      {c.libere ? <span className="badge desactive">Sorti</span>
                        : pret ? <button className="btn petit primaire" onClick={() => sortir(c)}>Retirer</button>
                        : <span className="badge actif">🔒 Bloqué</span>}
                    </td>
                  </tr>
                );
              })}
              {!liste.length && <tr><td colSpan={3} className="vide-tab">Aucun coffre.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
