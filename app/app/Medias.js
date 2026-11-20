'use client';

import { useEffect, useRef, useState } from 'react';
import { chargerMedia, redimensionnerPhoto, blobEnTexte, fmtDuree, DUREE_MAX_VOCAL, MAX_CARACTERES } from '@/lib/medias';

// Contenu d'une bulle : texte, photo ou vocal
export function ContenuMessage({ m, onChargee }) {
  if (m.supprime) return <span className="texte supprime">🚫 Message supprimé</span>;
  if (m.type === 'image' && m.mediaId) return <PhotoMessage id={m.mediaId} onChargee={onChargee} />;
  if (m.type === 'audio' && m.mediaId) return <VocalMessage id={m.mediaId} duree={m.duree || 0} />;
  return <span className="texte">{m.texte}</span>;
}

function PhotoMessage({ id, onChargee }) {
  const [src, setSrc] = useState(null);
  const [erreur, setErreur] = useState(false);
  const [plein, setPlein] = useState(false);

  useEffect(() => {
    let actif = true;
    chargerMedia(id).then((d) => actif && setSrc(d)).catch(() => actif && setErreur(true));
    return () => { actif = false; };
  }, [id]);

  if (erreur) return <span className="texte">📷 Photo indisponible</span>;
  if (!src) return <div className="photo-attente">📷 Chargement…</div>;
  return (
    <>
      <img className="photo-msg" src={src} alt="Photo" onLoad={onChargee} onClick={() => setPlein(true)} />
      {plein && (
        <div className="fond photo-plein" onClick={() => setPlein(false)}>
          <img src={src} alt="Photo" />
        </div>
      )}
    </>
  );
}

function VocalMessage({ id, duree }) {
  const [src, setSrc] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState(false);

  async function charger() {
    setOccupe(true);
    try { setSrc(await chargerMedia(id)); } catch { setErreur(true); }
    setOccupe(false);
  }

  if (src) return <audio className="vocal-lecteur" controls autoPlay src={src} />;
  return (
    <button type="button" className="vocal-btn" onClick={charger} disabled={occupe}>
      {erreur ? '⚠️ Vocal indisponible' : occupe ? '…' : `▶ Message vocal · ${fmtDuree(duree)}`}
    </button>
  );
}

// Barre du bas : texte, 📎 photo, 🎤 vocal
export function BarreSaisie({ onTexte, onMedia }) {
  const [texte, setTexte] = useState('');
  const [apercu, setApercu] = useState(null);
  const [erreur, setErreur] = useState('');
  const [enreg, setEnreg] = useState(false);
  const [secondes, setSecondes] = useState(0);

  const fichier = useRef(null);
  const rec = useRef(null);
  const morceaux = useRef([]);
  const minuteur = useRef(null);
  const annule = useRef(false);
  const debut = useRef(0);

  useEffect(() => () => {
    annule.current = true;
    clearInterval(minuteur.current);
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
  }, []);

  function soumettre(e) {
    e.preventDefault();
    onTexte(texte);
    setTexte('');
  }

  async function choisirPhoto(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErreur('');
    try {
      setApercu(await redimensionnerPhoto(f));
    } catch {
      setErreur('Photo illisible ou trop lourde.');
    }
  }

  function envoyerPhoto() {
    onMedia('image', apercu, 0);
    setApercu(null);
  }

  async function demarrerVocal() {
    setErreur('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return setErreur("L'enregistrement vocal n'est pas disponible sur ce navigateur.");
    }
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const r = new MediaRecorder(flux, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 });
      morceaux.current = [];
      annule.current = false;
      r.ondataavailable = (e) => { if (e.data && e.data.size) morceaux.current.push(e.data); };
      r.onstop = async () => {
        flux.getTracks().forEach((t) => t.stop());
        clearInterval(minuteur.current);
        setEnreg(false);
        if (annule.current) return;
        const duree = Math.max(1, Math.round((Date.now() - debut.current) / 1000));
        try {
          const data = await blobEnTexte(new Blob(morceaux.current, { type: r.mimeType || mime || 'audio/webm' }));
          if (data.length > MAX_CARACTERES) return setErreur('Vocal trop long.');
          onMedia('audio', data, duree);
        } catch {
          setErreur("Le vocal n'a pas pu être préparé.");
        }
      };
      rec.current = r;
      debut.current = Date.now();
      setSecondes(0);
      r.start();
      setEnreg(true);
      minuteur.current = setInterval(() => {
        const s = Math.round((Date.now() - debut.current) / 1000);
        setSecondes(s);
        if (s >= DUREE_MAX_VOCAL && r.state !== 'inactive') r.stop();
      }, 250);
    } catch {
      setErreur('Micro refusé. Autorisez le micro dans les réglages du navigateur.');
    }
  }

  function arreterVocal(envoyer) {
    annule.current = !envoyer;
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
  }

  return (
    <>
      {erreur && <p className="erreur marge">{erreur}</p>}

      {apercu && (
        <div className="apercu-photo">
          <img src={apercu} alt="Aperçu" />
          <div className="ligne">
            <button type="button" className="btn" onClick={() => setApercu(null)}>Annuler</button>
            <button type="button" className="btn primaire" onClick={envoyerPhoto}>Envoyer la photo</button>
          </div>
        </div>
      )}

      {enreg ? (
        <div className="saisie enreg">
          <button type="button" className="icone" onClick={() => arreterVocal(false)} title="Annuler">🗑</button>
          <div className="enreg-temps"><span className="point-rec" /> {fmtDuree(secondes)}</div>
          <button type="button" className="btn primaire" onClick={() => arreterVocal(true)}>Envoyer ➤</button>
        </div>
      ) : (
        <form className="saisie" onSubmit={soumettre}>
          <button type="button" className="icone" onClick={() => fichier.current?.click()} title="Envoyer une photo">📎</button>
          <input ref={fichier} type="file" accept="image/*" hidden onChange={choisirPhoto} />
          <input
            className="champ"
            placeholder="Écrire un message"
            value={texte}
            maxLength={2000}
            autoFocus
            onChange={(e) => setTexte(e.target.value)}
          />
          {texte.trim() ? (
            <button className="btn primaire">Envoyer</button>
          ) : (
            <button type="button" className="btn primaire" onClick={demarrerVocal} title="Message vocal">🎤</button>
          )}
        </form>
      )}
    </>
  );
}

