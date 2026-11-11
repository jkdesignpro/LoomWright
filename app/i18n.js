/*
 * LoomWright interface languages.
 * Each entry is the English text, then German | French | Spanish | Dutch.
 * Anything not listed stays in English. Corrections and new languages are welcome.
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function () {
  'use strict';
  const LANGS = [['en', 'English'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'], ['nl', 'Nederlands']];
  const COL = { de: 0, fr: 1, es: 2, nl: 3 };
  const KEY = 'loomwright.lang';

  const D = {
    // menus
    'File': 'Datei|Fichier|Archivo|Bestand', 'Edit': 'Bearbeiten|Édition|Editar|Bewerken', 'View': 'Ansicht|Affichage|Ver|Beeld',
    'Arrange': 'Anordnen|Disposer|Organizar|Schikken', 'Sheet': 'Blatt|Folio|Hoja|Blad', 'Tools': 'Werkzeuge|Outils|Herramientas|Extra',
    'Reports': 'Berichte|Rapports|Informes|Rapporten', 'Revision': 'Revision|Révision|Revisión|Revisie', 'Help': 'Hilfe|Aide|Ayuda|Help',
    // commands
    'New project': 'Neues Projekt|Nouveau projet|Proyecto nuevo|Nieuw project', 'Open…': 'Öffnen…|Ouvrir…|Abrir…|Openen…',
    'Open example project': 'Beispielprojekt öffnen|Ouvrir le projet exemple|Abrir el proyecto de ejemplo|Voorbeeldproject openen',
    'Close project': 'Projekt schließen|Fermer le projet|Cerrar proyecto|Project sluiten', 'Save': 'Speichern|Enregistrer|Guardar|Opslaan',
    'Save as…': 'Speichern unter…|Enregistrer sous…|Guardar como…|Opslaan als…',
    'Print or save PDF (all sheets)': 'Drucken oder als PDF (alle Blätter)|Imprimer ou PDF (tous les folios)|Imprimir o PDF (todas las hojas)|Afdrukken of PDF (alle bladen)',
    'Build pack (PDF)…': 'Baumappe (PDF)…|Dossier de fabrication (PDF)…|Dossier de montaje (PDF)…|Bouwmap (PDF)…',
    'Wire labels…': 'Leitungsetiketten…|Étiquettes de fils…|Etiquetas de cables…|Draadlabels…',
    'Import wire list (spreadsheet)…': 'Leitungsliste importieren (Tabelle)…|Importer une liste de fils (tableur)…|Importar lista de cables (hoja de cálculo)…|Draadlijst importeren (spreadsheet)…',
    'Import WireViz (YAML)…': 'WireViz importieren (YAML)…|Importer WireViz (YAML)…|Importar WireViz (YAML)…|WireViz importeren (YAML)…',
    'Import KiCad netlist…': 'KiCad-Netzliste importieren…|Importer une netlist KiCad…|Importar netlist de KiCad…|KiCad-netlist importeren…',
    'Import wire lengths (CAD)…': 'Leitungslängen importieren (CAD)…|Importer les longueurs (CAO)…|Importar longitudes (CAD)…|Draadlengtes importeren (CAD)…',
    'Export sheet as SVG': 'Blatt als SVG exportieren|Exporter le folio en SVG|Exportar hoja como SVG|Blad exporteren als SVG',
    'Export sheet as PNG': 'Blatt als PNG exportieren|Exporter le folio en PNG|Exportar hoja como PNG|Blad exporteren als PNG',
    'Export sheet as DXF (CAD)': 'Blatt als DXF exportieren (CAD)|Exporter le folio en DXF (CAO)|Exportar hoja como DXF (CAD)|Blad exporteren als DXF (CAD)',
    'Save read-only web page…': 'Schreibgeschützte Webseite speichern…|Enregistrer une page web en lecture seule…|Guardar página web de solo lectura…|Alleen-lezen webpagina opslaan…',
    'Export for WireViz (YAML)…': 'Für WireViz exportieren (YAML)…|Exporter pour WireViz (YAML)…|Exportar para WireViz (YAML)…|Exporteren voor WireViz (YAML)…',
    'Export wire list (CSV)': 'Leitungsliste exportieren (CSV)|Exporter la liste des fils (CSV)|Exportar lista de cables (CSV)|Draadlijst exporteren (CSV)',
    'Export parts and costs (CSV)': 'Teile und Kosten exportieren (CSV)|Exporter pièces et coûts (CSV)|Exportar piezas y costes (CSV)|Onderdelen en kosten exporteren (CSV)',
    'Export cable totals (CSV)': 'Leitungsmengen exportieren (CSV)|Exporter les totaux de câble (CSV)|Exportar totales de cable (CSV)|Kabeltotalen exporteren (CSV)',
    'Export cut list (CSV)': 'Zuschnittliste exportieren (CSV)|Exporter la liste de coupe (CSV)|Exportar lista de corte (CSV)|Kniplijst exporteren (CSV)',
    'Export connector tables (CSV)': 'Steckerbelegung exportieren (CSV)|Exporter les tableaux de connecteurs (CSV)|Exportar tablas de conectores (CSV)|Connectortabellen exporteren (CSV)',
    'Export fuses and loads (CSV)': 'Sicherungen und Lasten exportieren (CSV)|Exporter fusibles et charges (CSV)|Exportar fusibles y cargas (CSV)|Zekeringen en belasting exporteren (CSV)',
    'Export wire labels (CSV)': 'Leitungsetiketten exportieren (CSV)|Exporter les étiquettes (CSV)|Exportar etiquetas (CSV)|Draadlabels exporteren (CSV)',
    'Export colour usage (CSV)': 'Farbnutzung exportieren (CSV)|Exporter l’usage des couleurs (CSV)|Exportar uso de colores (CSV)|Kleurgebruik exporteren (CSV)',
    'Undo': 'Rückgängig|Annuler|Deshacer|Ongedaan maken', 'Redo': 'Wiederholen|Rétablir|Rehacer|Opnieuw',
    'Cut': 'Ausschneiden|Couper|Cortar|Knippen', 'Copy': 'Kopieren|Copier|Copiar|Kopiëren', 'Paste': 'Einfügen|Coller|Pegar|Plakken',
    'Duplicate': 'Duplizieren|Dupliquer|Duplicar|Dupliceren', 'Delete': 'Löschen|Supprimer|Eliminar|Verwijderen',
    'Select all on sheet': 'Alles auf dem Blatt wählen|Tout sélectionner sur le folio|Seleccionar todo en la hoja|Alles op blad selecteren',
    'Find…': 'Suchen…|Rechercher…|Buscar…|Zoeken…', 'Find and replace…': 'Suchen und ersetzen…|Rechercher et remplacer…|Buscar y reemplazar…|Zoeken en vervangen…',
    'Renumber wires and parts…': 'Leitungen und Teile neu nummerieren…|Renuméroter fils et composants…|Renumerar cables y piezas…|Draden en onderdelen hernummeren…',
    'Save selection as block…': 'Auswahl als Block speichern…|Enregistrer la sélection comme bloc…|Guardar selección como bloque…|Selectie opslaan als blok…',
    'Rotate': 'Drehen|Pivoter|Girar|Draaien', 'Flip': 'Spiegeln|Retourner|Voltear|Spiegelen',
    'Align left': 'Links ausrichten|Aligner à gauche|Alinear a la izquierda|Links uitlijnen', 'Align centres': 'Mittig ausrichten|Centrer|Centrar|Centreren',
    'Align right': 'Rechts ausrichten|Aligner à droite|Alinear a la derecha|Rechts uitlijnen', 'Align tops': 'Oben ausrichten|Aligner en haut|Alinear arriba|Boven uitlijnen',
    'Align middles': 'Vertikal zentrieren|Centrer verticalement|Centrar verticalmente|Verticaal centreren', 'Align bottoms': 'Unten ausrichten|Aligner en bas|Alinear abajo|Onder uitlijnen',
    'Distribute across': 'Horizontal verteilen|Répartir horizontalement|Distribuir horizontalmente|Horizontaal verdelen',
    'Distribute down': 'Vertikal verteilen|Répartir verticalement|Distribuir verticalmente|Verticaal verdelen',
    'Zoom in': 'Vergrößern|Zoom avant|Acercar|Inzoomen', 'Zoom out': 'Verkleinern|Zoom arrière|Alejar|Uitzoomen',
    'Fit sheet to window': 'Blatt einpassen|Ajuster le folio à la fenêtre|Ajustar hoja a la ventana|Blad passend maken',
    'Parts library': 'Teilebibliothek|Bibliothèque de composants|Biblioteca de piezas|Onderdelenbibliotheek',
    'Project and sheets': 'Projekt und Blätter|Projet et folios|Proyecto y hojas|Project en bladen',
    'Revision history': 'Revisionsverlauf|Historique des révisions|Historial de revisiones|Revisiegeschiedenis',
    'Properties': 'Eigenschaften|Propriétés|Propiedades|Eigenschappen', 'Lists and reports': 'Listen und Berichte|Listes et rapports|Listas e informes|Lijsten en rapporten',
    'Junction dots': 'Verbindungspunkte|Points de jonction|Puntos de unión|Knooppunten',
    'Sheet cross-references': 'Blattverweise|Renvois entre folios|Referencias entre hojas|Bladverwijzingen',
    'Black and white drawings': 'Schwarzweiß-Zeichnungen|Dessins en noir et blanc|Dibujos en blanco y negro|Zwart-wit tekeningen',
    'Dark theme': 'Dunkles Design|Thème sombre|Tema oscuro|Donker thema', 'Language…': 'Sprache…|Langue…|Idioma…|Taal…', 'Language': 'Sprache|Langue|Idioma|Taal',
    'New sheet': 'Neues Blatt|Nouveau folio|Hoja nueva|Nieuw blad', 'Duplicate sheet': 'Blatt duplizieren|Dupliquer le folio|Duplicar hoja|Blad dupliceren',
    'Rename sheet': 'Blatt umbenennen|Renommer le folio|Renombrar hoja|Blad hernoemen', 'Delete sheet': 'Blatt löschen|Supprimer le folio|Eliminar hoja|Blad verwijderen',
    'Move sheet left': 'Blatt nach links|Déplacer le folio à gauche|Mover hoja a la izquierda|Blad naar links',
    'Move sheet right': 'Blatt nach rechts|Déplacer le folio à droite|Mover hoja a la derecha|Blad naar rechts',
    'Previous sheet': 'Vorheriges Blatt|Folio précédent|Hoja anterior|Vorig blad', 'Next sheet': 'Nächstes Blatt|Folio suivant|Hoja siguiente|Volgend blad',
    'Trace circuit': 'Stromkreis verfolgen|Suivre le circuit|Seguir circuito|Circuit volgen',
    'Live circuit test': 'Live-Schaltungstest|Test du circuit en direct|Prueba del circuito en vivo|Live circuittest',
    'Harness formboard…': 'Kabelbaum-Formbrett…|Planche de faisceau…|Tablero del mazo…|Kabelboomplank…',
    'Component locations (vehicle view)…': 'Einbauorte (Fahrzeugansicht)…|Emplacements (vue véhicule)…|Ubicaciones (vista del vehículo)…|Montageplaatsen (voertuigaanzicht)…',
    'Component builder…': 'Bauteil-Editor…|Éditeur de composants…|Editor de componentes…|Onderdeleneditor…',
    'Wire colours and stock…': 'Leitungsfarben und Vorrat…|Couleurs de fils et stock…|Colores de cable y stock…|Draadkleuren en voorraad…',
    'Cables (multicore, screened)…': 'Kabel (mehradrig, geschirmt)…|Câbles (multiconducteurs, blindés)…|Mangueras (multipolares, apantalladas)…|Kabels (meeraderig, afgeschermd)…',
    'Import components and blocks…': 'Bauteile und Blöcke importieren…|Importer composants et blocs…|Importar componentes y bloques…|Onderdelen en blokken importeren…',
    'Export my components and blocks…': 'Meine Bauteile und Blöcke exportieren…|Exporter mes composants et blocs…|Exportar mis componentes y bloques…|Mijn onderdelen en blokken exporteren…',
    'Run design checks': 'Entwurfsprüfung ausführen|Lancer les contrôles|Ejecutar comprobaciones|Ontwerpcontrole uitvoeren',
    'Wire list': 'Leitungsliste|Liste des fils|Lista de cables|Draadlijst', 'Parts and costs': 'Teile und Kosten|Pièces et coûts|Piezas y costes|Onderdelen en kosten',
    'Cable totals': 'Leitungsmengen|Totaux de câble|Totales de cable|Kabeltotalen', 'Colour usage': 'Farbnutzung|Usage des couleurs|Uso de colores|Kleurgebruik',
    'Fuses and loads': 'Sicherungen und Lasten|Fusibles et charges|Fusibles y cargas|Zekeringen en belasting',
    'Connector tables': 'Steckerbelegung|Tableaux de connecteurs|Tablas de conectores|Connectortabellen', 'Cut list': 'Zuschnittliste|Liste de coupe|Lista de corte|Kniplijst',
    'Circuits': 'Stromkreise|Circuits|Circuitos|Circuits', 'Issue revision…': 'Revision herausgeben…|Émettre une révision…|Emitir revisión…|Revisie uitgeven…',
    'Compare revisions…': 'Revisionen vergleichen…|Comparer les révisions…|Comparar revisiones…|Revisies vergelijken…',
    'Keep a save point now': 'Jetzt Sicherungspunkt anlegen|Créer un point de sauvegarde|Crear punto de guardado ahora|Nu een herstelpunt maken',
    'Use with Claude…': 'Mit Claude verwenden…|Utiliser avec Claude…|Usar con Claude…|Gebruiken met Claude…',
    'Keyboard and mouse': 'Tastatur und Maus|Clavier et souris|Teclado y ratón|Toetsenbord en muis', 'About LoomWright': 'Über LoomWright|À propos de LoomWright|Acerca de LoomWright|Over LoomWright',
    // ribbon and panes
    'New': 'Neu|Nouveau|Nuevo|Nieuw', 'Open': 'Öffnen|Ouvrir|Abrir|Openen', 'Parts': 'Teile|Pièces|Piezas|Onderdelen', 'Project': 'Projekt|Projet|Proyecto|Project',
    'History': 'Verlauf|Historique|Historial|Geschiedenis', 'Builder': 'Editor|Éditeur|Editor|Editor', 'Colours': 'Farben|Couleurs|Colores|Kleuren',
    'Lists': 'Listen|Listes|Listas|Lijsten', 'Check': 'Prüfen|Contrôler|Comprobar|Controleren', 'Trace': 'Verfolgen|Suivre|Seguir|Volgen', 'Test': 'Test|Test|Prueba|Test',
    'Formboard': 'Formbrett|Planche|Tablero|Plank', 'Vehicle': 'Fahrzeug|Véhicule|Vehículo|Voertuig', 'Pack': 'Mappe|Dossier|Dossier|Map', 'Search': 'Suchen|Rechercher|Buscar|Zoeken',
    'Search parts': 'Teile suchen|Rechercher des pièces|Buscar piezas|Onderdelen zoeken', 'Light or dark': 'Hell oder dunkel|Clair ou sombre|Claro u oscuro|Licht of donker',
    'Type a command, part or sheet': 'Befehl, Teil oder Blatt eingeben|Commande, pièce ou folio|Escribe un comando, pieza u hoja|Typ een opdracht, onderdeel of blad',
    'Add sheet': 'Blatt hinzufügen|Ajouter un folio|Añadir hoja|Blad toevoegen', 'Fit to window (0)': 'Einpassen (0)|Ajuster (0)|Ajustar (0)|Passend maken (0)',
    'Parts & costs': 'Teile & Kosten|Pièces & coûts|Piezas y costes|Onderdelen & kosten', 'Fuses & loads': 'Sicherungen & Lasten|Fusibles & charges|Fusibles y cargas|Zekeringen & belasting',
    'Connectors': 'Stecker|Connecteurs|Conectores|Connectoren', 'Checks': 'Prüfungen|Contrôles|Comprobaciones|Controles', 'All sheets': 'Alle Blätter|Tous les folios|Todas las hojas|Alle bladen',
    'Hide lists': 'Listen ausblenden|Masquer les listes|Ocultar listas|Lijsten verbergen', 'Show lists': 'Listen anzeigen|Afficher les listes|Mostrar listas|Lijsten tonen',
    'Close': 'Schließen|Fermer|Cerrar|Sluiten', 'Cancel': 'Abbrechen|Annuler|Cancelar|Annuleren', 'Done': 'Fertig|Terminé|Hecho|Klaar', 'OK': 'OK|OK|Aceptar|OK',
    'Import': 'Importieren|Importer|Importar|Importeren', 'Export': 'Exportieren|Exporter|Exportar|Exporteren', 'Apply': 'Übernehmen|Appliquer|Aplicar|Toepassen',
    'Restore': 'Wiederherstellen|Restaurer|Restaurar|Herstellen', 'Compare…': 'Vergleichen…|Comparer…|Comparar…|Vergelijken…', 'Remove': 'Entfernen|Retirer|Quitar|Verwijderen',
    // inspector and panes
    'Identity': 'Kennung|Identité|Identidad|Identiteit', 'Part data': 'Teiledaten|Données de la pièce|Datos de la pieza|Onderdeelgegevens', 'Drawing': 'Zeichnung|Dessin|Dibujo|Tekening',
    'Build': 'Fertigung|Fabrication|Montaje|Bouw', 'Cable': 'Kabel|Câble|Manguera|Kabel', 'Colour': 'Farbe|Couleur|Color|Kleur', 'Controls': 'Bedienung|Commandes|Controles|Bediening',
    'Working now': 'Jetzt in Betrieb|En marche|Funcionando ahora|Nu in werking', 'Getting started': 'Erste Schritte|Pour commencer|Primeros pasos|Aan de slag',
    'Set on all selected wires': 'Für alle gewählten Leitungen|Sur tous les fils sélectionnés|En todos los cables seleccionados|Op alle geselecteerde draden',
    'Circuit': 'Stromkreis|Circuit|Circuito|Circuit', 'Harness': 'Kabelbaum|Faisceau|Mazo|Kabelboom', 'Insulation': 'Isolierung|Isolant|Aislamiento|Isolatie',
    'Length (m)': 'Länge (m)|Longueur (m)|Longitud (m)|Lengte (m)', 'Current (A)': 'Strom (A)|Courant (A)|Corriente (A)|Stroom (A)', 'Location': 'Einbauort|Emplacement|Ubicación|Plaats',
    'Name': 'Name|Nom|Nombre|Naam', 'Reference': 'Referenz|Repère|Referencia|Referentie', 'Part number': 'Teilenummer|Référence fabricant|Número de pieza|Onderdeelnummer',
    'Supplier': 'Lieferant|Fournisseur|Proveedor|Leverancier', 'Size': 'Querschnitt|Section|Sección|Doorsnede', 'Terminal': 'Kontakt|Cosse|Terminal|Kabelschoen',
    'Seal': 'Dichtung|Joint|Junta|Afdichting', 'Strip (mm)': 'Abisolieren (mm)|Dénuder (mm)|Pelar (mm)|Strippen (mm)', 'Heat shrink': 'Schrumpfschlauch|Gaine thermo|Termorretráctil|Krimpkous',
    'Fitting': 'Montage|Montage|Montaje|Montage', 'Tracer': 'Kennfarbe|Traceur|Franja|Spoorkleur', 'Second tracer': 'Zweite Kennfarbe|Second traceur|Segunda franja|Tweede spoorkleur',
    'Main': 'Grundfarbe|Couleur principale|Color base|Basiskleur', 'Wire number': 'Leitungsnummer|Numéro de fil|Número de cable|Draadnummer', 'In cable': 'Im Kabel|Dans le câble|En manguera|In kabel',
    'Routing': 'Verlegung|Cheminement|Recorrido|Route', 'Wire labels': 'Leitungsbeschriftung|Repères de fils|Etiquetas de cable|Draadlabels', 'Sheet size': 'Blattgröße|Format du folio|Tamaño de hoja|Bladformaat', 'Paper size, all sheets': 'Papierformat, alle Blätter|Format du papier, tous les folios|Tamaño de papel, todas las hojas|Papierformaat, alle bladen',
    'Paper size': 'Papierformat|Format papier|Tamaño de papel|Papierformaat', 'Project default': 'Projektvorgabe|Valeur du projet|Valor del proyecto|Projectstandaard',
    'Landscape': 'Querformat|Paysage|Horizontal|Liggend', 'Portrait': 'Hochformat|Portrait|Vertical|Staand', 'Fit to drawing': 'An Zeichnung anpassen|Ajusté au dessin|Ajustar al dibujo|Passend op tekening',
    'System voltage': 'Bordnetzspannung|Tension du réseau|Tensión del sistema|Systeemspanning', 'Colour codes': 'Farbcodes|Codes couleur|Códigos de color|Kleurcodes',
    'Title block and revision table': 'Schriftfeld und Revisionstabelle|Cartouche et tableau des révisions|Cajetín y tabla de revisiones|Titelblok en revisietabel', 'Colour key': 'Farblegende|Légende des couleurs|Leyenda de colores|Kleurlegenda',
    'Orientation': 'Ausrichtung|Orientation|Orientación|Oriëntatie', 'Currency symbol': 'Währungssymbol|Symbole monétaire|Símbolo de moneda|Valutasymbool',
    'Cut allowance per wire (m)': 'Zuschlag je Leitung (m)|Surlongueur par fil (m)|Margen por cable (m)|Toeslag per draad (m)',
    'Sheets': 'Blätter|Folios|Hojas|Bladen', 'Harnesses': 'Kabelbäume|Faisceaux|Mazos|Kabelbomen', 'Cables': 'Kabel|Câbles|Mangueras|Kabels', 'Totals': 'Summen|Totaux|Totales|Totalen',
    'Title': 'Titel|Titre|Título|Titel', 'Drawn by': 'Gezeichnet von|Dessiné par|Dibujado por|Getekend door', 'Date': 'Datum|Date|Fecha|Datum',
    'Add harness': 'Kabelbaum hinzufügen|Ajouter un faisceau|Añadir mazo|Kabelboom toevoegen', 'Cables…': 'Kabel…|Câbles…|Mangueras…|Kabels…',
    'Issued revisions': 'Herausgegebene Revisionen|Révisions émises|Revisiones emitidas|Uitgegeven revisies', 'Current revision': 'Aktuelle Revision|Révision actuelle|Revisión actual|Huidige revisie',
    'Save points on this computer': 'Sicherungspunkte auf diesem Computer|Points de sauvegarde sur cet ordinateur|Puntos de guardado en este equipo|Herstelpunten op deze computer',
    'Compare with now': 'Mit jetzt vergleichen|Comparer à maintenant|Comparar con ahora|Vergelijken met nu', 'Open copy': 'Kopie öffnen|Ouvrir une copie|Abrir copia|Kopie openen',
    'Issue revision': 'Revision herausgeben|Émettre une révision|Emitir revisión|Revisie uitgeven', 'Compare revisions': 'Revisionen vergleichen|Comparer les révisions|Comparar revisiones|Revisies vergelijken',
    'Description': 'Beschreibung|Description|Descripción|Omschrijving', 'By': 'Von|Par|Por|Door',
    'Circuit trace': 'Stromkreisverfolgung|Suivi de circuit|Seguimiento de circuito|Circuit volgen', 'Operate the circuit': 'Schaltung bedienen|Actionner le circuit|Operar el circuito|Circuit bedienen',
    'Stop test': 'Test beenden|Arrêter le test|Detener prueba|Test stoppen', 'Reset all': 'Alles zurücksetzen|Tout réinitialiser|Restablecer todo|Alles terugzetten',
    // tables
    'Wire': 'Leitung|Fil|Cable|Draad', 'From': 'Von|De|Desde|Van', 'To': 'Nach|Vers|Hasta|Naar', 'Code': 'Code|Code|Código|Code', 'Length m': 'Länge m|Longueur m|Longitud m|Lengte m',
    'Current A': 'Strom A|Courant A|Corriente A|Stroom A', 'Drop V': 'Abfall V|Chute V|Caída V|Val V', 'Notes': 'Notizen|Notes|Notas|Notities', 'Qty': 'Menge|Qté|Cant.|Aantal',
    'Component': 'Bauteil|Composant|Componente|Onderdeel', 'Spec': 'Wert|Caractéristique|Especificación|Specificatie', 'Unit': 'Stückpreis|Prix unitaire|Precio unidad|Stukprijs',
    'Total': 'Gesamt|Total|Total|Totaal', 'References': 'Referenzen|Repères|Referencias|Referenties', 'Total m': 'Gesamt m|Total m|Total m|Totaal m',
    'Buy (+15%)': 'Kaufen (+15%)|Acheter (+15 %)|Comprar (+15%)|Kopen (+15%)', 'Per metre': 'Je Meter|Par mètre|Por metro|Per meter', 'Cost': 'Kosten|Coût|Coste|Kosten',
    'Missing lengths': 'Fehlende Längen|Longueurs manquantes|Longitudes que faltan|Ontbrekende lengtes', 'Wires': 'Leitungen|Fils|Cables|Draden',
    'Used for': 'Verwendet für|Utilisé pour|Usado para|Gebruikt voor', 'Fuse': 'Sicherung|Fusible|Fusible|Zekering', 'Relay': 'Relais|Relais|Relé|Relais',
    'Rating A': 'Nennstrom A|Calibre A|Calibre A|Waarde A', 'Load A': 'Last A|Charge A|Carga A|Belasting A', 'Use': 'Auslastung|Utilisation|Uso|Gebruik',
    'Fuses and breakers': 'Sicherungen und Automaten|Fusibles et disjoncteurs|Fusibles e interruptores|Zekeringen en automaten', 'Relays': 'Relais|Relais|Relés|Relais',
    'Supplies': 'Versorgungen|Alimentations|Alimentaciones|Voedingen', 'Cavity': 'Kammer|Alvéole|Cavidad|Kamer', 'Goes to': 'Geht zu|Va vers|Va a|Gaat naar',
    'Cut m': 'Zuschnitt m|Coupe m|Corte m|Knip m', 'End A': 'Ende A|Extrémité A|Extremo A|Eind A', 'End B': 'Ende B|Extrémité B|Extremo B|Eind B',
    'Connections': 'Anschlüsse|Connexions|Conexiones|Aansluitingen', 'Level': 'Stufe|Niveau|Nivel|Niveau', 'Finding': 'Befund|Constat|Hallazgo|Bevinding',
    'No harness': 'Kein Kabelbaum|Sans faisceau|Sin mazo|Geen kabelboom', 'check': 'prüfen|à vérifier|revisar|controleren', 'error': 'Fehler|erreur|error|fout', 'info': 'Info|info|info|info',
    // status bar and messages
    'Checks passed': 'Prüfungen bestanden|Contrôles réussis|Comprobaciones superadas|Controles geslaagd', 'checks to review': 'Prüfungen offen|contrôles à revoir|comprobaciones por revisar|controles te bekijken',
    'Desktop': 'Desktop|Bureau|Escritorio|Desktop', 'Browser': 'Browser|Navigateur|Navegador|Browser', 'Preview': 'Vorschau|Aperçu|Vista previa|Voorbeeld', 'LIVE TEST': 'LIVE-TEST|TEST EN DIRECT|PRUEBA EN VIVO|LIVETEST',
    'portrait': 'Hochformat|portrait|vertical|staand', 'Untitled': 'Unbenannt|Sans titre|Sin título|Naamloos', 'Untitled project': 'Unbenanntes Projekt|Projet sans titre|Proyecto sin título|Naamloos project',
    'Unsaved changes': 'Ungespeicherte Änderungen|Modifications non enregistrées|Cambios sin guardar|Niet-opgeslagen wijzigingen', 'Saved': 'Gespeichert|Enregistré|Guardado|Opgeslagen',
    'Copied': 'Kopiert|Copié|Copiado|Gekopieerd', 'Opened': 'Geöffnet|Ouvert|Abierto|Geopend', 'Imported': 'Importiert|Importé|Importado|Geïmporteerd',
    'Could not open that file': 'Datei konnte nicht geöffnet werden|Impossible d’ouvrir ce fichier|No se pudo abrir el archivo|Kan dat bestand niet openen',
    'Could not save': 'Speichern fehlgeschlagen|Échec de l’enregistrement|No se pudo guardar|Opslaan mislukt', 'Could not import': 'Import fehlgeschlagen|Échec de l’import|No se pudo importar|Importeren mislukt',
    'No problems found': 'Keine Probleme gefunden|Aucun problème|No se encontraron problemas|Geen problemen gevonden', 'No problems found.': 'Keine Probleme gefunden.|Aucun problème.|No se encontraron problemas.|Geen problemen gevonden.',
    'Nothing matches.': 'Keine Treffer.|Aucun résultat.|Sin resultados.|Geen resultaten.', 'Command': 'Befehl|Commande|Comando|Opdracht', 'Part': 'Teil|Pièce|Pieza|Onderdeel',
    'Find': 'Suchen|Rechercher|Buscar|Zoeken', 'Replace with': 'Ersetzen durch|Remplacer par|Reemplazar por|Vervangen door', 'Replace all': 'Alle ersetzen|Tout remplacer|Reemplazar todo|Alles vervangen',
    'Match case': 'Groß/klein beachten|Respecter la casse|Coincidir mayúsculas|Hoofdlettergevoelig', 'Whole words': 'Ganze Wörter|Mots entiers|Palabras completas|Hele woorden',
    'Find and replace': 'Suchen und ersetzen|Rechercher et remplacer|Buscar y reemplazar|Zoeken en vervangen', 'Renumber': 'Neu nummerieren|Renuméroter|Renumerar|Hernummeren',
    'Wire colours': 'Leitungsfarben|Couleurs de fils|Colores de cable|Draadkleuren', 'My colours': 'Meine Farben|Mes couleurs|Mis colores|Mijn kleuren',
    'Colours I stock': 'Farben auf Vorrat|Couleurs en stock|Colores en stock|Kleuren op voorraad', 'Standard colours': 'Standardfarben|Couleurs standard|Colores estándar|Standaardkleuren',
    'My components': 'Meine Bauteile|Mes composants|Mis componentes|Mijn onderdelen', 'My blocks': 'Meine Blöcke|Mes blocs|Mis bloques|Mijn blokken',
    'Build pack': 'Baumappe|Dossier de fabrication|Dossier de montaje|Bouwmap', 'Print or save PDF': 'Drucken oder PDF|Imprimer ou PDF|Imprimir o PDF|Afdrukken of PDF',
    'Save as web page': 'Als Webseite speichern|Enregistrer en page web|Guardar como página web|Opslaan als webpagina',
    'Harness formboard': 'Kabelbaum-Formbrett|Planche de faisceau|Tablero del mazo|Kabelboomplank', 'Component locations': 'Einbauorte|Emplacements des composants|Ubicación de componentes|Montageplaatsen',
    // library categories
    'Power & charging': 'Versorgung & Laden|Alimentation & charge|Alimentación y carga|Voeding & laden', 'Protection': 'Absicherung|Protection|Protección|Beveiliging',
    'Switches': 'Schalter|Interrupteurs|Interruptores|Schakelaars', 'Relays & control': 'Relais & Steuerung|Relais & commande|Relés y control|Relais & besturing',
    'Lighting': 'Beleuchtung|Éclairage|Iluminación|Verlichting', 'Motors & loads': 'Motoren & Verbraucher|Moteurs & récepteurs|Motores y cargas|Motoren & verbruikers',
    'Gauges & sensors': 'Instrumente & Sensoren|Indicateurs & capteurs|Indicadores y sensores|Meters & sensoren', 'Wiring & connectors': 'Verdrahtung & Stecker|Câblage & connecteurs|Cableado y conectores|Bedrading & connectoren',
    'Electronics': 'Elektronik|Électronique|Electrónica|Elektronica', 'Annotation': 'Beschriftung|Annotation|Anotación|Annotatie',
    'Portable copy: settings and My components are kept next to the program in': 'Portable Kopie: Einstellungen und Meine Bauteile liegen neben dem Programm in|Copie portable : réglages et Mes composants sont à côté du programme dans|Copia portátil: los ajustes y Mis componentes están junto al programa en|Draagbare kopie: instellingen en Mijn onderdelen staan naast het programma in',
    'My components are kept in': 'Meine Bauteile liegen in|Mes composants sont enregistrés dans|Mis componentes se guardan en|Mijn onderdelen staan in',
  };
  // Singular and plural of the nouns used in counts, per language.
  const NOUNS = {
    wire: [['Leitung', 'Leitungen'], ['fil', 'fils'], ['cable', 'cables'], ['draad', 'draden']],
    part: [['Teil', 'Teile'], ['pièce', 'pièces'], ['pieza', 'piezas'], ['onderdeel', 'onderdelen']],
    sheet: [['Blatt', 'Blätter'], ['folio', 'folios'], ['hoja', 'hojas'], ['blad', 'bladen']],
    connection: [['Anschluss', 'Anschlüsse'], ['connexion', 'connexions'], ['conexión', 'conexiones'], ['aansluiting', 'aansluitingen']],
    component: [['Bauteil', 'Bauteile'], ['composant', 'composants'], ['componente', 'componentes'], ['onderdeel', 'onderdelen']],
    block: [['Block', 'Blöcke'], ['bloc', 'blocs'], ['bloque', 'bloques'], ['blok', 'blokken']],
    match: [['Treffer', 'Treffer'], ['résultat', 'résultats'], ['resultado', 'resultados'], ['resultaat', 'resultaten']],
    check: [['Prüfung', 'Prüfungen'], ['contrôle', 'contrôles'], ['comprobación', 'comprobaciones'], ['controle', 'controles']],
  };

  let lang = 'en';
  try { lang = localStorage.getItem(KEY) || String(navigator.language || 'en').slice(0, 2).toLowerCase(); } catch (e) { lang = 'en'; }
  if (!LANGS.some((l) => l[0] === lang)) lang = 'en';

  function t(s) {
    if (lang === 'en' || s == null) return s;
    if (NOUNS[s]) return NOUNS[s][COL[lang]][0];
    const e = D[s];
    if (!e) return s;
    const v = e.split('|')[COL[lang]];
    return v || s;
  }
  // "3 wires": n with the translated singular w (as returned by t('wire')).
  function plural(n, w) {
    if (n === 1) return `${n} ${w}`;
    if (lang === 'en') return `${n} ${w}s`;
    const hit = Object.values(NOUNS).find((x) => x[COL[lang]][0] === w);
    return `${n} ${hit ? hit[COL[lang]][1] : w}`;
  }
  /* Translate the static page: text of [data-t] elements and title / aria-label / placeholder attributes. */
  function apply(root) {
    document.documentElement.lang = lang;
    if (lang === 'en') return;
    root.querySelectorAll('[data-t]').forEach((el) => { const k = el.dataset.t || el.textContent.trim(); el.dataset.t = k; el.textContent = t(k); });
    ['title', 'aria-label', 'placeholder'].forEach((a) => root.querySelectorAll(`[${a}]`).forEach((el) => {
      const k = el.getAttribute('data-t-' + a) || el.getAttribute(a);
      el.setAttribute('data-t-' + a, k);
      // keep shortcut hints such as "(Ctrl+K)" while translating the words
      const m = /^(.*?)(\s*\([^)]*\))?$/.exec(k);
      el.setAttribute(a, D[k] ? t(k) : D[m[1]] ? t(m[1]) + (m[2] || '') : k);
    }));
  }
  function set(c) { lang = LANGS.some((l) => l[0] === c) ? c : 'en'; try { localStorage.setItem(KEY, lang); } catch (e) { /* storage unavailable */ } }

  window.LoomI18n = { t, plural, apply, set, get lang() { return lang; }, languages: LANGS };
})();
