#!/usr/bin/env python3
"""Produit la version artefact du site : un seul fichier HTML autonome.

    python3 tools/build_artefact.py            # écrit dist/eliott-la-popote.html
    python3 tools/build_artefact.py --strict   # échoue s'il reste une référence locale

Ce que fait le script, dans l'ordre :
  1. lit index.html ;
  2. remplace les marqueurs <!-- PARTIAL: nom --> encore présents par partials/nom.html ;
  3. remplace chaque <link rel="stylesheet"> local par un <style> (avec les @import
     locaux résolus) ; les @import distants (Google Fonts) deviennent des <link> ;
  4. convertit en data URI les fichiers locaux cités dans le CSS (url(...)) et dans
     les attributs src / href (favicon, monogramme, images) ;
  5. met le JavaScript local en ligne, en fin de <body> (équivalent de defer) ;
  6. ajoute le contenu de mentions-legales.html en fin de page, sous l'ancre
     #mentions-legales, et réécrit les liens entre les deux pages ;
  7. signale toute référence locale qui n'a pas pu être incluse.

Python standard uniquement, aucune dépendance.
"""

import argparse
import base64
import mimetypes
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SORTIE = RACINE / "dist" / "eliott-la-popote.html"
PAGE_LEGALE = "mentions-legales.html"
ANCRE_LEGALE = "mentions-legales"

mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("image/webp", ".webp")

DISTANT = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//|#)", re.I)

avertissements = []


def avertir(message):
    avertissements.append(message)
    print("  ! " + message, file=sys.stderr)


def est_local(ref):
    ref = ref.strip()
    return bool(ref) and not DISTANT.match(ref)


def sans_suffixe(ref):
    """Retire ?query et #fragment d'une référence locale."""
    return re.split(r"[?#]", ref, maxsplit=1)[0]


def data_uri(chemin):
    type_mime = mimetypes.guess_type(chemin.name)[0] or "application/octet-stream"
    contenu = chemin.read_bytes()
    if type_mime == "image/svg+xml":
        # Les SVG restent lisibles et plus légers en texte encodé qu'en base64
        texte = contenu.decode("utf-8")
        texte = re.sub(r"<\?xml[^>]*\?>", "", texte).strip()
        texte = re.sub(r">\s+<", "><", texte)
        encode = (
            texte.replace("%", "%25").replace("#", "%23").replace('"', "'")
            .replace("<", "%3C").replace(">", "%3E").replace("\n", " ")
        )
        return "data:image/svg+xml," + encode
    return "data:%s;base64,%s" % (type_mime, base64.b64encode(contenu).decode("ascii"))


def resoudre(base, ref):
    chemin = (base / sans_suffixe(ref)).resolve()
    try:
        chemin.relative_to(RACINE)
    except ValueError:
        avertir("référence hors du dossier du site ignorée : %s" % ref)
        return None
    if not chemin.is_file():
        avertir("fichier introuvable : %s" % ref)
        return None
    return chemin


# --- Partials -----------------------------------------------------------------

def inserer_partials(html):
    def remplacer(m):
        nom = m.group(1).strip()
        fichier = RACINE / "partials" / (nom + ".html")
        if not fichier.is_file():
            avertir("marqueur PARTIAL: %s sans fichier partials/%s.html" % (nom, nom))
            return m.group(0)
        print("  · partial « %s » inséré depuis partials/%s.html" % (nom, nom))
        return fichier.read_text(encoding="utf-8").strip()

    return re.sub(r"<!--\s*PARTIAL:\s*([\w-]+)\s*-->", remplacer, html)


# --- CSS ----------------------------------------------------------------------

def lire_css(chemin, imports_distants, deja_vus):
    if chemin in deja_vus:
        return ""
    deja_vus.add(chemin)
    css = chemin.read_text(encoding="utf-8")
    base = chemin.parent

    def importer(m):
        ref = m.group(1) or m.group(2) or m.group(3)
        if not est_local(ref):
            imports_distants.append(ref)
            return ""
        cible = resoudre(base, ref)
        return lire_css(cible, imports_distants, deja_vus) if cible else ""

    css = re.sub(
        r"""@import\s+(?:url\(\s*["']?([^"')]+)["']?\s*\)|"([^"]+)"|'([^']+)')[^;]*;""",
        importer,
        css,
    )

    def url(m):
        guillemet, ref = m.group(1), m.group(2)
        if not est_local(ref):
            return m.group(0)
        cible = resoudre(base, ref)
        if not cible:
            return m.group(0)
        return 'url("%s")' % data_uri(cible).replace('"', "%22")

    css = re.sub(r"""url\(\s*(["']?)([^"')]+)\1\s*\)""", url, css)
    return "/* --- %s --- */\n%s" % (chemin.relative_to(RACINE).as_posix(), css.strip())


def inliner_css(html):
    imports_distants = []
    deja_vus = set()

    motif = re.compile(r"<link\b[^>]*>", re.I)

    def remplacer(m):
        balise = m.group(0)
        if not re.search(r"""rel\s*=\s*["']?stylesheet""", balise, re.I):
            return balise
        href = re.search(r"""href\s*=\s*["']([^"']+)["']""", balise, re.I)
        if not href or not est_local(href.group(1)):
            return balise
        cible = resoudre(RACINE, href.group(1))
        if not cible:
            return balise
        print("  · CSS en ligne : %s" % href.group(1))
        css = lire_css(cible, imports_distants, deja_vus)
        return "<style>\n%s\n</style>" % css.replace("</style", "<\\/style")

    html = motif.sub(remplacer, html)

    if imports_distants:
        liens = "".join(
            '<link rel="stylesheet" href="%s">\n' % ref for ref in dict.fromkeys(imports_distants)
        )
        if "fonts.googleapis.com" in liens and "fonts.gstatic.com" not in html:
            liens = (
                '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
                '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' + liens
            )
        premier_style = html.find("<style>")
        if premier_style == -1:
            html = html.replace("</head>", liens + "</head>", 1)
        else:
            html = html[:premier_style] + liens + html[premier_style:]
    return html


# --- JavaScript ---------------------------------------------------------------

def inliner_js(html):
    scripts = []

    def remplacer(m):
        balise = m.group(0)
        src = re.search(r"""src\s*=\s*["']([^"']+)["']""", balise, re.I)
        if not src or not est_local(src.group(1)):
            return balise
        cible = resoudre(RACINE, src.group(1))
        if not cible:
            return balise
        print("  · JS en ligne : %s" % src.group(1))
        js = cible.read_text(encoding="utf-8").replace("</script", "<\\/script")
        scripts.append("<script>\n/* --- %s --- */\n%s\n</script>" % (src.group(1), js.strip()))
        return ""

    html = re.sub(r"<script\b[^>]*\bsrc\s*=[^>]*>\s*</script>\s*", remplacer, html, flags=re.I)
    if scripts:
        bloc = "\n".join(scripts) + "\n"
        if "</body>" in html:
            html = html.replace("</body>", bloc + "</body>", 1)
        else:
            html += bloc
    return html


# --- Attributs src / href -----------------------------------------------------

def inliner_ressources(html):
    def remplacer(m):
        attribut, guillemet, ref = m.group(1), m.group(2), m.group(3)
        if not est_local(ref):
            return m.group(0)
        if sans_suffixe(ref).lower().endswith((".html", ".htm")):
            return m.group(0)
        cible = resoudre(RACINE, ref)
        if not cible:
            return m.group(0)
        valeur = data_uri(cible).replace(guillemet, "%22" if guillemet == '"' else "%27")
        return "%s=%s%s%s" % (attribut, guillemet, valeur, guillemet)

    return re.sub(r"""\b(src|href)\s*=\s*(["'])([^"']+)\2""", remplacer, html, flags=re.I)


# --- Page légale --------------------------------------------------------------

def integrer_mentions(html):
    fichier = RACINE / PAGE_LEGALE
    html = re.sub(r"""href=(["'])(?:\./)?index\.html#""", r"href=\1#", html)
    html = re.sub(r"""href=(["'])(?:\./)?index\.html\1""", r"href=\1#haut\1", html)

    if not fichier.is_file():
        return html

    legale = fichier.read_text(encoding="utf-8")
    m = re.search(r"<main\b[^>]*>(.*?)</main>", legale, re.S | re.I)
    if not m:
        avertir("%s n'a pas de <main> : page légale non intégrée" % PAGE_LEGALE)
        return html

    contenu = m.group(1).strip()
    contenu = re.sub(r"""href=(["'])(?:\./)?index\.html#""", r"href=\1#", contenu)
    contenu = re.sub(r"""href=(["'])(?:\./)?index\.html\1""", r"href=\1#haut\1", contenu)
    # Les id de la page légale ne doivent pas entrer en collision avec ceux de l'accueil
    contenu = re.sub(r"""\bid=(["'])(?!mentions-legales)""", r"id=\1ml-", contenu)

    html = re.sub(
        r"""href=(["'])(?:\./)?%s(?:#[^"']*)?\1""" % re.escape(PAGE_LEGALE),
        r"href=\1#%s\1" % ANCRE_LEGALE,
        html,
    )
    section = (
        '\n<section id="%s" class="section mentions-artefact" aria-label="Mentions légales">\n'
        "%s\n</section>\n" % (ANCRE_LEGALE, contenu)
    )
    if "</main>" in html:
        html = html.replace("</main>", section + "</main>", 1)
    else:
        html = html.replace("</body>", section + "</body>", 1)
    print("  · %s intégrée sous #%s" % (PAGE_LEGALE, ANCRE_LEGALE))
    return html


# --- Contrôle final -----------------------------------------------------------

def references_locales(html):
    restes = []
    for m in re.finditer(r"""\b(?:src|href)\s*=\s*["']([^"']+)["']""", html, re.I):
        if est_local(m.group(1)):
            restes.append(m.group(1))
    for m in re.finditer(r"""url\(\s*["']?([^"')]+)["']?\s*\)""", html):
        if est_local(m.group(1)):
            restes.append(m.group(1))
    return restes


def compter_placeholders(html):
    texte = re.sub(r"<(script|style)\b.*?</\1>", "", html, flags=re.S | re.I)
    return len(re.findall(r"\[À COMPLÉTER[^\]]*\]", texte))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--strict", action="store_true",
                        help="code de sortie 1 s'il reste une référence locale ou un avertissement")
    parser.add_argument("--sortie", type=Path, default=SORTIE, help="fichier à écrire")
    args = parser.parse_args()

    index = RACINE / "index.html"
    if not index.is_file():
        print("index.html introuvable dans %s" % RACINE, file=sys.stderr)
        return 1

    print("Construction de l'artefact depuis %s" % index.relative_to(RACINE.parent))
    html = index.read_text(encoding="utf-8")
    html = inserer_partials(html)
    html = integrer_mentions(html)
    html = inliner_css(html)
    html = inliner_js(html)
    html = inliner_ressources(html)

    restes = references_locales(html)
    for ref in dict.fromkeys(restes):
        avertir("référence locale non incluse : %s" % ref)

    args.sortie.parent.mkdir(parents=True, exist_ok=True)
    args.sortie.write_text(html, encoding="utf-8")

    taille = args.sortie.stat().st_size
    print("\nÉcrit : %s (%.1f Ko)" % (args.sortie.relative_to(RACINE.parent) if args.sortie.is_relative_to(RACINE.parent) else args.sortie, taille / 1024))
    print("Placeholders [À COMPLÉTER] visibles : %d" % compter_placeholders(html))
    if avertissements:
        print("%d avertissement(s)." % len(avertissements))
        if args.strict:
            return 1
    else:
        print("Aucun avertissement : le fichier est autonome (hors police Google Fonts).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
