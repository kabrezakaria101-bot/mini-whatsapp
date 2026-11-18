import {
  collection, doc, writeBatch, increment, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// ---- Réglages -------------------------------------------------------------
export const TAUX_RETRAIT = 3;       // % prélevé sur un retrait chez un agent (gagné par l'agent)
export const MONTANT_MIN = 100;      // FCFA
export const MONTANT_MAX = 5000000;  // FCFA (doit rester identique dans firestore.rules)

// Frais arrondis au FCFA supérieur : 10 000 -> 300
export const calculFrais = (montant) => Math.floor((montant * TAUX_RETRAIT + 99) / 100);

export const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`;

// ---- Outils internes ------------------------------------------------------
const refCompte = (numero) => doc(db, 'comptes', numero);
const nouvelleTx = () => doc(collection(db, 'transactions'));

function verifier(montant) {
  if (!Number.isInteger(montant) || montant < MONTANT_MIN) {
    throw new Error(`Montant invalide (minimum ${MONTANT_MIN} FCFA, sans virgule).`);
  }
  if (montant > MONTANT_MAX) throw new Error(`Montant trop élevé (maximum ${fcfa(MONTANT_MAX)}).`);
}

function dataTx(type, expediteur, destinataire, montant, frais = 0, extra = {}) {
  return {
    type, expediteur, destinataire, montant, frais,
    date: serverTimestamp(),
    participants: [expediteur, destinataire],
    ...extra,
  };
}

// Toutes les opérations sont des écritures groupées (tout passe ou rien ne passe).
// Les règles de sécurité vérifient que les montants débités et crédités sont cohérents.
async function valider(batch) {
  try {
    await batch.commit();
  } catch (e) {
    if (e.code === 'permission-denied') {
      throw new Error("Opération refusée (solde insuffisant, compte inactif ou règles non à jour).");
    }
    throw new Error('Opération impossible. Vérifiez votre connexion et réessayez.');
  }
}

// ---- Opérations utilisateur ----------------------------------------------

// Envoi direct de l'argent d'un utilisateur à un autre (sans frais)
export async function transferer(moi, dest, montant) {
  verifier(montant);
  const tx = nouvelleTx();
  const b = writeBatch(db);
  b.set(tx, dataTx('transfert', moi, dest, montant));
  b.set(refCompte(moi), { solde: increment(-montant), derniereTx: tx.id }, { merge: true });
  b.set(refCompte(dest), { solde: increment(montant), derniereTx: tx.id }, { merge: true });
  await valider(b);
}

// Retrait chez un agent : le client paie montant + frais, l'agent reçoit montant + frais
// et remet `montant` en espèces (les frais sont sa commission).
export async function retirer(moi, agent, montant) {
  verifier(montant);
  const frais = calculFrais(montant);
  const tx = nouvelleTx();
  const b = writeBatch(db);
  b.set(tx, dataTx('retrait', moi, agent, montant, frais));
  b.set(refCompte(moi), { solde: increment(-(montant + frais)), derniereTx: tx.id }, { merge: true });
  b.set(refCompte(agent), { solde: increment(montant + frais), derniereTx: tx.id }, { merge: true });
  await valider(b);
}

// Mettre de l'argent au coffre jusqu'à une date
export async function mettreAuCoffre(moi, montant, dateDispo) {
  verifier(montant);
  if (!(dateDispo instanceof Date) || isNaN(dateDispo) || dateDispo <= new Date()) {
    throw new Error('Choisissez une date de retrait dans le futur.');
  }
  const tx = nouvelleTx();
  const coffre = doc(collection(db, 'comptes', moi, 'coffres'));
  const b = writeBatch(db);
  b.set(tx, dataTx('coffre_depot', moi, moi, montant, 0, { coffreId: coffre.id }));
  b.set(refCompte(moi), { solde: increment(-montant), derniereTx: tx.id }, { merge: true });
  b.set(coffre, {
    montant,
    dispo: Timestamp.fromDate(dateDispo),
    libere: false,
    creeLe: serverTimestamp(),
    tx: tx.id,
  });
  await valider(b);
}

// Sortir un coffre arrivé à échéance (le serveur refuse avant la date)
export async function libererCoffre(moi, coffre) {
  const tx = nouvelleTx();
  const b = writeBatch(db);
  b.set(tx, dataTx('coffre_retrait', moi, moi, coffre.montant, 0, { coffreId: coffre.id }));
  b.set(refCompte(moi), { solde: increment(coffre.montant), derniereTx: tx.id }, { merge: true });
  b.update(doc(db, 'comptes', moi, 'coffres', coffre.id), { libere: true, txLib: tx.id });
  await valider(b);
}

// ---- Opérations administrateur -------------------------------------------

// L'admin crédite un compte (dépôt d'espèces, recharge)
export async function deposer(admin, dest, montant) {
  verifier(montant);
  const tx = nouvelleTx();
  const b = writeBatch(db);
  b.set(tx, dataTx('depot', admin, dest, montant));
  b.set(refCompte(dest), { solde: increment(montant), derniereTx: tx.id }, { merge: true });
  await valider(b);
}

// L'admin débite un compte (ex. : il paie en espèces un agent qui veut récupérer son solde)
export async function debiter(admin, cible, montant) {
  verifier(montant);
  const tx = nouvelleTx();
  const b = writeBatch(db);
  b.set(tx, dataTx('debit_admin', admin, cible, montant));
  b.set(refCompte(cible), { solde: increment(-montant), derniereTx: tx.id }, { merge: true });
  await valider(b);
}
