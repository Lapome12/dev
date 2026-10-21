/* ==========================================================================
   Eliott la Popote : script principal
   Propriétaire : Dev 3.
   Sommaire :
     1. Démarrage
     2. Menu mobile (ouverture, Échap, piège de focus)
     3. Filet de l'en-tête au défilement
     4. Apparitions au défilement
     5. Avis : compteur du défilement mobile
     6. Formulaire de réservation (validation, mailto:, confirmation)
   Chaque bloc vérifie que ses éléments existent : une section absente
   ne fait jamais planter le reste.
   ========================================================================== */

(function () {
  "use strict";

  var racine = document.documentElement;
  racine.classList.add("js");

  var mouvementReduit = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };


  /* 2. Menu mobile -----------------------------------------------------------
     Bouton attendu : <button aria-controls="id-de-la-nav" aria-expanded="false">
     avec la classe .nav__bouton ou l'attribut data-nav-bouton.
     Ouvert : .nav--ouverte sur la nav, .menu-ouvert sur <html>.
     ------------------------------------------------------------------------- */

  function initialiserMenu() {
    var bouton = document.querySelector("[data-nav-bouton], .nav__bouton");
    if (!bouton) return;

    var idNav = bouton.getAttribute("aria-controls");
    var nav = (idNav && document.getElementById(idNav)) || document.querySelector(".nav");
    if (!nav) return;

    var libelle = bouton.querySelector("[data-nav-libelle]") || null;
    var dernierFocus = null;

    function focusables() {
      var liste = nav.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      return [bouton].concat(Array.prototype.filter.call(liste, function (el) {
        return el.offsetParent !== null || el === document.activeElement;
      }));
    }

    function ouvrir() {
      dernierFocus = document.activeElement;
      nav.classList.add("nav--ouverte");
      racine.classList.add("menu-ouvert");
      bouton.setAttribute("aria-expanded", "true");
      if (libelle) libelle.textContent = "Fermer";
      var premier = nav.querySelector("a[href], button");
      if (premier) premier.focus();
      document.addEventListener("keydown", gererClavier);
    }

    function fermer(rendreFocus) {
      nav.classList.remove("nav--ouverte");
      racine.classList.remove("menu-ouvert");
      bouton.setAttribute("aria-expanded", "false");
      if (libelle) libelle.textContent = "Menu";
      document.removeEventListener("keydown", gererClavier);
      if (rendreFocus !== false) (dernierFocus && dernierFocus.focus ? dernierFocus : bouton).focus();
    }

    function estOuvert() {
      return bouton.getAttribute("aria-expanded") === "true";
    }

    function gererClavier(e) {
      if (e.key === "Escape" || e.key === "Esc") {
        e.preventDefault();
        fermer();
        return;
      }
      if (e.key !== "Tab") return;
      var liste = focusables();
      if (!liste.length) return;
      var premier = liste[0];
      var dernier = liste[liste.length - 1];
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      }
    }

    bouton.addEventListener("click", function () {
      if (estOuvert()) fermer();
      else ouvrir();
    });

    // Un lien d'ancre choisi dans le menu referme le menu
    nav.addEventListener("click", function (e) {
      var lien = e.target.closest ? e.target.closest("a[href]") : null;
      if (lien && estOuvert()) fermer(false);
    });

    // Retour sur grand écran : on ne laisse pas un menu ouvert en plan
    window.addEventListener("resize", function () {
      if (estOuvert() && window.getComputedStyle(bouton).display === "none") fermer(false);
    });
  }


  /* 3. Filet de l'en-tête -----------------------------------------------------
     Ajoute .est-defile sur l'en-tête dès qu'on quitte le haut de page.
     ------------------------------------------------------------------------- */

  function initialiserEntete() {
    var entete = document.querySelector(".entete, .en-tete, body > header");
    if (!entete) return;

    var enAttente = false;
    function mettreAJour() {
      enAttente = false;
      entete.classList.toggle("est-defile", window.scrollY > 8);
    }
    window.addEventListener("scroll", function () {
      if (!enAttente) {
        enAttente = true;
        window.requestAnimationFrame(mettreAJour);
      }
    }, { passive: true });
    mettreAJour();
  }


  /* 4. Apparitions ------------------------------------------------------------
     base.css masque .apparait dès que <html> porte .js : ce bloc doit donc
     toujours finir par rendre les éléments visibles.
     ------------------------------------------------------------------------- */

  function initialiserApparitions() {
    var blocs = document.querySelectorAll(".apparait");
    if (!blocs.length) return;

    function toutAfficher() {
      Array.prototype.forEach.call(blocs, function (el) {
        el.classList.add("est-visible");
      });
    }

    if (mouvementReduit.matches || !("IntersectionObserver" in window)) {
      toutAfficher();
      return;
    }

    var observateur = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (entree) {
        if (entree.isIntersecting) {
          entree.target.classList.add("est-visible");
          observateur.unobserve(entree.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

    Array.prototype.forEach.call(blocs, function (el) {
      observateur.observe(el);
    });

    // Arrivée directe sur une ancre ou impression : tout s'affiche
    window.addEventListener("beforeprint", toutAfficher);
  }


  /* 5. Avis : compteur « 1 / 3 » du défilement mobile ----------------------- */

  function initialiserAvis() {
    var defile = document.querySelector(".avis__defile");
    var compteur = document.querySelector("[data-avis-compteur]");
    if (!defile || !compteur) return;

    var items = defile.querySelectorAll(".avis__item");
    if (!items.length) return;

    function mettreAJour() {
      var gauche = defile.getBoundingClientRect().left;
      var actif = 0;
      var meilleur = Infinity;
      Array.prototype.forEach.call(items, function (item, i) {
        var ecart = Math.abs(item.getBoundingClientRect().left - gauche);
        if (ecart < meilleur) {
          meilleur = ecart;
          actif = i;
        }
      });
      compteur.textContent = (actif + 1) + " / " + items.length;
    }

    defile.addEventListener("scroll", function () {
      window.requestAnimationFrame(mettreAJour);
    }, { passive: true });
    mettreAJour();
  }


  /* 6. Formulaire de réservation --------------------------------------------
     Textes : CONTENU.md, section VIII.
     ------------------------------------------------------------------------- */

  var MESSAGES = {
    vide: "Ce champ m'aide à préparer votre devis, merci de le remplir.",
    email: "Cette adresse e-mail ne semble pas complète.",
    datePassee: "Cette date est déjà passée, choisissez-en une à venir.",
    dateInvalide: "Cette date ne semble pas valide.",
    convives: "Indiquez un nombre de convives entre 1 et 60.",
    telephone: "Ce numéro ne semble pas complet."
  };

  var RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function aujourdhuiISO() {
    var d = new Date();
    var mois = String(d.getMonth() + 1).padStart(2, "0");
    var jour = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mois + "-" + jour;
  }

  function dateLisible(iso) {
    var morceaux = iso.split("-");
    if (morceaux.length !== 3) return iso;
    var d = new Date(Number(morceaux[0]), Number(morceaux[1]) - 1, Number(morceaux[2]));
    try {
      return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    } catch (e) {
      return morceaux[2] + "/" + morceaux[1] + "/" + morceaux[0];
    }
  }

  function initialiserFormulaire() {
    var form = document.getElementById("reserver-formulaire");
    if (!form) return;

    var confirmation = document.getElementById("reserver-confirmation");
    var champDate = form.elements.namedItem("date");
    if (champDate) champDate.setAttribute("min", aujourdhuiISO());

    function erreurDe(champ) {
      return document.getElementById(champ.id + "-erreur");
    }

    function afficherErreur(champ, message) {
      var zone = erreurDe(champ);
      if (message) {
        champ.setAttribute("aria-invalid", "true");
        if (zone) {
          zone.textContent = message;
          zone.hidden = false;
        }
      } else {
        champ.removeAttribute("aria-invalid");
        if (zone) {
          zone.textContent = "";
          zone.hidden = true;
        }
      }
    }

    function verifier(champ) {
      var valeur = (champ.value || "").trim();
      var nom = champ.name;

      if (champ.required && !valeur) return MESSAGES.vide;
      if (!valeur) return "";

      if (nom === "email" && !RE_EMAIL.test(valeur)) return MESSAGES.email;

      if (nom === "telephone") {
        var chiffres = valeur.replace(/[^\d]/g, "");
        if (chiffres.length < 9 || /[^\d\s.+()-]/.test(valeur)) return MESSAGES.telephone;
      }

      if (nom === "date") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return MESSAGES.dateInvalide;
        if (valeur < aujourdhuiISO()) return MESSAGES.datePassee;
      }

      if (nom === "convives") {
        var n = Number(valeur);
        if (!Number.isInteger(n) || n < 1 || n > 60) return MESSAGES.convives;
      }

      return "";
    }

    var aVerifier = Array.prototype.filter.call(form.elements, function (el) {
      return el.name && erreurDe(el);
    });

    aVerifier.forEach(function (champ) {
      // On attend que la personne quitte le champ avant de la reprendre,
      // puis on corrige en direct une fois l'erreur affichée.
      champ.addEventListener("blur", function () {
        if (champ.value.trim() || champ.getAttribute("aria-invalid") === "true") {
          afficherErreur(champ, verifier(champ));
        }
      });
      champ.addEventListener("input", function () {
        if (champ.getAttribute("aria-invalid") === "true") afficherErreur(champ, verifier(champ));
      });
    });

    function valeur(nom) {
      var el = form.elements.namedItem(nom);
      return el ? (el.value || "").trim() : "";
    }

    function construireMailto() {
      var destinataire = (form.getAttribute("data-destinataire") || "").trim();
      if (!RE_EMAIL.test(destinataire)) destinataire = "";

      var date = valeur("date");
      var convives = valeur("convives");
      var sujet = "Demande de date : " + dateLisible(date) + ", " + convives +
        (Number(convives) > 1 ? " convives" : " convive");

      var lignes = [
        "Bonjour Eliott,",
        "",
        "Je souhaite réserver une date avec la Popote.",
        "",
        "Nom : " + valeur("nom"),
        "E-mail : " + valeur("email"),
        "Téléphone : " + (valeur("telephone") || "non précisé"),
        "Date souhaitée : " + dateLisible(date),
        "Nombre de convives : " + convives,
        "Ville : " + valeur("ville"),
        "Occasion : " + (valeur("occasion") || "non précisée"),
        "Allergies ou régimes : " + (valeur("allergies") || "aucun signalé")
      ];
      if (valeur("message")) lignes.push("", valeur("message"));
      lignes.push("", "À bientôt,", valeur("nom"));

      return {
        destinataire: destinataire,
        url: "mailto:" + encodeURIComponent(destinataire).replace(/%40/g, "@") +
          "?subject=" + encodeURIComponent(sujet) +
          "&body=" + encodeURIComponent(lignes.join("\r\n"))
      };
    }

    function afficherConfirmation(destinataire) {
      if (!confirmation) return;
      var adresse = destinataire || "[À COMPLÉTER : e-mail]";
      confirmation.innerHTML = "";

      var titre = document.createElement("p");
      titre.className = "reserver__confirmation-titre";
      titre.textContent = "Merci !";

      var texte = document.createElement("p");
      texte.appendChild(document.createTextNode(
        "Votre messagerie va s'ouvrir avec la demande prête à partir. Si rien ne s'ouvre, écrivez-moi directement à "
      ));
      var lien;
      if (destinataire) {
        lien = document.createElement("a");
        lien.href = "mailto:" + destinataire;
        lien.textContent = adresse;
      } else {
        lien = document.createElement("span");
        lien.className = "placeholder";
        lien.textContent = adresse;
      }
      texte.appendChild(lien);
      texte.appendChild(document.createTextNode("."));

      confirmation.appendChild(titre);
      confirmation.appendChild(texte);
      confirmation.hidden = false;
      confirmation.focus({ preventScroll: true });
      confirmation.scrollIntoView({ behavior: mouvementReduit.matches ? "auto" : "smooth", block: "center" });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var premierEnErreur = null;
      aVerifier.forEach(function (champ) {
        var message = verifier(champ);
        afficherErreur(champ, message);
        if (message && !premierEnErreur) premierEnErreur = champ;
      });

      if (premierEnErreur) {
        if (confirmation) confirmation.hidden = true;
        premierEnErreur.focus();
        return;
      }

      var envoi = construireMailto();
      form.setAttribute("data-dernier-mailto", envoi.url);
      afficherConfirmation(envoi.destinataire);
      window.location.href = envoi.url;
    });
  }


  /* 1. Démarrage ---------------------------------------------------------- */

  function demarrer() {
    [initialiserMenu, initialiserEntete, initialiserApparitions, initialiserAvis, initialiserFormulaire]
      .forEach(function (init) {
        try {
          init();
        } catch (erreur) {
          if (window.console) console.error("[la Popote]", init.name, erreur);
          // Jamais de contenu laissé masqué par une erreur
          Array.prototype.forEach.call(document.querySelectorAll(".apparait"), function (el) {
            el.classList.add("est-visible");
          });
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", demarrer);
  } else {
    demarrer();
  }
})();
